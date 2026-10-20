
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const legacyServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const secretMap = Deno.env.get("SUPABASE_SECRET_KEYS");
const serviceKey = legacyServiceKey || (secretMap ? JSON.parse(secretMap).default : null);
if (!serviceKey) throw new Error("Supabase server key unavailable");

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function ensureVapidConfig() {
  const { data: config, error: configError } = await admin
    .from("push_config")
    .select("vapid_public_key")
    .eq("singleton", true)
    .maybeSingle();
  if (configError) throw configError;

  let publicKey = config?.vapid_public_key || null;
  let privateKey = null;

  const { data: privateData, error: privateError } = await admin.rpc("get_push_vapid_private_key");
  if (privateError) throw privateError;
  privateKey = privateData || null;

  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    const { error: storeError } = await admin.rpc("store_push_vapid_config", {
      p_private_key: keys.privateKey,
      p_public_key: keys.publicKey
    });
    if (storeError) throw storeError;
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
  }

  webpush.setVapidDetails("mailto:admin@opencompanygame.com", publicKey, privateKey);
  return { publicKey };
}


const toB64=(a:Uint8Array)=>btoa(String.fromCharCode(...a)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
async function getFirebaseAuth():Promise<string>{
 const raw=Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
 if(!raw)throw Error("Firebase service-account secret missing");
 const k=JSON.parse(raw);if(k.project_id!=="opencompany-be0c0")throw Error("Firebase project mismatch");
 const bytes=Uint8Array.from(atob(k.private_key.replace(/-----[^-]+-----|\s/g,"")),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey("pkcs8",bytes,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const now=Math.floor(Date.now()/1000),enc=new TextEncoder();
 const header=toB64(enc.encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
 const payload=toB64(enc.encode(JSON.stringify({iss:k.client_email,scope:"https://www.googleapis.com/auth/firebase.messaging",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})));
 const sig=toB64(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc.encode(header+"."+payload))));
 const res=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:header+"."+payload+"."+sig})});
 if(!res.ok)throw Error("Google OAuth error "+res.status);
 return (await res.json()).access_token;
}
async function deliverFirebase(token:string,event:any,access:string){
 const res=await fetch("https://fcm.googleapis.com/v1/projects/opencompany-be0c0/messages:send",{method:"POST",headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},body:JSON.stringify({message:{token,notification:{title:event.title,body:event.body},data:{url:event.url||"https://opencompanygame.com/"}}})});
 if(res.ok)return {ok:true,expired:false};
 const details=await res.text();
 return {ok:false,expired:res.status===404||res.status===400&&/UNREGISTERED|registration token/i.test(details)};
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    await ensureVapidConfig();

    const { data: events, error: queueError } = await admin
      .from("push_notification_queue")
      .select("id,user_id,event_type,reference_id,title,body,url,attempts")
      .eq("status", "pending")
      .lt("attempts", 5)
      .order("created_at", { ascending: true })
      .limit(50);

    if (queueError) throw queueError;

    let sent = 0;
    let failed = 0;

    for (const event of events || []) {
      const { data: subscriptions, error: subError } = await admin
        .from("push_subscriptions")
        .select("id,endpoint,p256dh,auth")
        .eq("user_id", event.user_id)
        .eq("enabled", true);

      if (subError) {
        await admin.from("push_notification_queue").update({
          attempts: Number(event.attempts || 0) + 1,
          last_error: subError.message
        }).eq("id", event.id);
        failed++;
        continue;
      }

      let delivered = false;
      const errors: string[] = [];
      const {data: nativeDevices,error: nativeLookupError}=await admin.from("push_app_devices").select("id,fcm_token").eq("user_id",event.user_id).eq("enabled",true);
      if(nativeLookupError)errors.push("Android device lookup failed");
      if(!nativeLookupError&&nativeDevices?.length){
        try{
          const access=await getFirebaseAuth();
          for(const device of nativeDevices){
            const outcome=await deliverFirebase(device.fcm_token,event,access);
            if(outcome.ok)delivered=true;
            else if(outcome.expired)await admin.from("push_app_devices").update({enabled:false}).eq("id",device.id);
            else errors.push("Firebase delivery failed");
          }
        }catch(e){console.error("Firebase transport unavailable",e instanceof Error?e.message:"unknown");errors.push("Firebase transport unavailable");}
      }

      for (const sub of (delivered ? [] : (subscriptions || []))) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            },
            JSON.stringify({
              title: event.title,
              body: event.body,
              url: event.url,
              tag: event.event_type + ":" + event.reference_id
            }),
            { TTL: 3600 }
          );
          delivered = true;
        } catch (error) {
          const statusCode = Number(error?.statusCode || error?.status || 0);
          if (statusCode === 404 || statusCode === 410) {
            await admin.from("push_subscriptions").delete().eq("id", sub.id);
          } else {
            errors.push(error?.message || String(error));
          }
        }
      }

      const attempts = Number(event.attempts || 0) + 1;
      if (delivered) {
        await admin.from("push_notification_queue").update({
          status: "sent",
          attempts,
          sent_at: new Date().toISOString(),
          last_error: errors.length ? errors.join(" | ").slice(0, 1000) : null
        }).eq("id", event.id);
        sent++;
      } else {
        await admin.from("push_notification_queue").update({
          status: attempts >= 5 ? "failed" : "pending",
          attempts,
          last_error: (errors.join(" | ") || "No active push subscription").slice(0, 1000)
        }).eq("id", event.id);
        failed++;
      }
    }

    return Response.json({ ok: true, processed: (events || []).length, sent, failed });
  } catch (error) {
    console.error("push-dispatch", error);
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
});
