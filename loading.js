const tasks=[];let complete=0,percent=0;
export function trackAsset(promise){
  const task=Promise.resolve(promise).finally(()=>{complete++;percent=Math.max(percent,Math.min(95,Math.round(complete/tasks.length*95)));document.querySelector('#load-percent').textContent=`${percent}%`;});
  tasks.push(task);return task;
}
export async function assetsReady(){await Promise.allSettled(tasks);document.querySelector('#load-percent').textContent='100%';document.querySelector('#entry-options').hidden=false;}
