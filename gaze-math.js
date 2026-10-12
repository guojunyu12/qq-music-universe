export const gazeFiles=['01-左上.jpg','02-上.jpg','03-右上.jpg','04-左.jpg','05-正视.jpg','06-右.jpg','07-左下.jpg','08-下.jpg','09-右下.jpg'];
export function gazeIndex(x,y,faceX=.64,faceY=.31){
  const column=x<faceX-.10?0:x>faceX+.10?2:1;
  const row=y<faceY-.10?0:y>faceY+.10?2:1;
  return row*3+column;
}

// Continuous coordinates retain the reference face centers and cover the full grid.
export function gazeCoordinates(x,y,faceX=.64,faceY=.31){
  const axis=(p,center,max)=>Math.max(0,Math.min(max,p<center?max*.5*p/center:max*.5+max*.5*(p-center)/(1-center)));
  return {x:axis(x,faceX,8),y:axis(y,faceY,2)};
}
// Exact critically damped spring step; stable after fast pointer reversals.
export function springStep(position,velocity,target,dt,omega=20){
  const t=Math.min(.05,Math.max(0,dt)),delta=position-target,c=velocity+omega*delta,e=Math.exp(-omega*t);
  return {position:target+(delta+c*t)*e,velocity:(velocity-omega*c*t)*e};
}
export function atlasWeights(x,y){
  x=Math.max(0,Math.min(8,x));y=Math.max(0,Math.min(2,y));
  const col=Math.min(7,Math.floor(x)),row=Math.min(1,Math.floor(y)),tx=x-col,ty=y-row;
  return {col,row,weights:[(1-tx)*(1-ty),tx*(1-ty),(1-tx)*ty,tx*ty]};
}
