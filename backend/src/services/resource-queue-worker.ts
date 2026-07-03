import {supabaseAdmin} from "../lib/supabase";
import {logger} from "../lib/logger";
import {processResourceById} from "./resource-job";
let active=0,timer:NodeJS.Timeout|null=null;
export async function processNextQueuedResource(){
  const max=Math.max(1,Math.min(4,Number(process.env.RESOURCE_PROCESSING_MAX_CONCURRENCY??2)));
  if(active>=max)return null;active++;
  try{
    const{data:job,error}=await supabaseAdmin.from("processing_jobs").select("id,resource_id,status").eq("status","uploaded").order("created_at",{ascending:true}).limit(1).maybeSingle();
    if(error)throw error;if(!job)return null;
    const{data:claimed,error:claimError}=await supabaseAdmin.from("processing_jobs").update({status:"extracting",current_step:"extracting_text",updated_at:new Date().toISOString()}).eq("id",job.id).eq("status","uploaded").select("id").maybeSingle();
    if(claimError)throw claimError;if(!claimed)return null;
    await processResourceById(supabaseAdmin,Number(job.resource_id));
    return Number(job.resource_id);
  }catch(error){logger.error({error:error instanceof Error?error.message:String(error)},"Automatic resource queue item failed");return null}
  finally{active--}
}
export function startResourceQueueWorker(){
  if(process.env.AUTO_PROCESS_RESOURCES==="false"||timer)return;
  const interval=Math.max(5000,Number(process.env.RESOURCE_QUEUE_INTERVAL_MS??15000));
  const max=Math.max(1,Math.min(4,Number(process.env.RESOURCE_PROCESSING_MAX_CONCURRENCY??2)));
  const tick=()=>{for(let i=active;i<max;i++)void processNextQueuedResource()};
  timer=setInterval(tick,interval);timer.unref();tick();
  logger.info({interval,maxConcurrency:max},"Automatic resource queue worker started");
}
