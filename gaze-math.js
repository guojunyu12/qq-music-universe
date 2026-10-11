export const gazeFiles=['01-左上.jpg','02-上.jpg','03-右上.jpg','04-左.jpg','05-正视.jpg','06-右.jpg','07-左下.jpg','08-下.jpg','09-右下.jpg'];
export function gazeIndex(x,y,faceX=.64,faceY=.31){
  const column=x<faceX-.10?0:x>faceX+.10?2:1;
  const row=y<faceY-.10?0:y>faceY+.10?2:1;
  return row*3+column;
}
