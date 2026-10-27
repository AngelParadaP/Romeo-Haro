import QRCode from 'qrcode';
function lines(ctx:CanvasRenderingContext2D,text:string,maxWidth:number,maxLines:number){
  const result:string[]=[];let line='';
  // Split long words as well, so names cannot overflow the invitation.
  const words=text.trim().split(/\s+/).flatMap(word=>{const parts:string[]=[];let part='';for(const char of word){if(ctx.measureText(part+char).width>maxWidth&&part){parts.push(part);part=char;}else part+=char;}if(part)parts.push(part);return parts;});
  for(const word of words){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>maxWidth&&line){result.push(line);line=word;}else line=next;}
  if(line)result.push(line);
  if(result.length>maxLines){result.length=maxLines;let last=result[maxLines-1];while(ctx.measureText(last+'…').width>maxWidth)last=last.slice(0,-1);result[maxLines-1]=last+'…';}
  return result;
}
export async function invitationFile(url:string,title:string,message:string){
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1600;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('No se pudo preparar la invitación.');
  ctx.fillStyle='#e7ecdf';ctx.fillRect(0,0,1200,1600);ctx.fillStyle='#fbfcf7';ctx.beginPath();ctx.roundRect(48,48,1104,1504,30);ctx.fill();ctx.strokeStyle='#d5dfc9';ctx.lineWidth=2;ctx.stroke();
  ctx.textAlign='center';ctx.fillStyle='#6d8063';ctx.font='20px Arial';ctx.fillText('UN EVENTO. TODAS LAS MIRADAS.',600,200);
  ctx.fillStyle='#294c3c';ctx.font='58px Georgia';const titleLines=lines(ctx,title,940,3);titleLines.forEach((line,i)=>ctx.fillText(line,600,290+i*70));
  ctx.fillStyle='#6b7a63';ctx.font='30px Arial';lines(ctx,message||'Te invitamos a compartir tus mejores recuerdos.',940,3).forEach((line,i)=>ctx.fillText(line,600,510+i*42));
  const qr=document.createElement('canvas');await QRCode.toCanvas(qr,url,{width:640,margin:4,errorCorrectionLevel:'M',color:{dark:'#294c3c',light:'#ffffff'}});ctx.drawImage(qr,280,650,640,640);
  ctx.font='27px Arial';ctx.fillStyle='#294c3c';ctx.fillText('Escanea, comparte tus fotos y revive el momento.',600,1350);
  ctx.font='20px Arial';ctx.fillStyle='#819173';ctx.fillText(new URL(url).hostname,600,1408);
  ctx.font='18px Georgia';ctx.fillText('Hecho para vivirlo. Creado para recordarlo.',600,1470);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('No se pudo generar el PNG.')),'image/png'));
  return new File([blob],'invitacion-evento.png',{type:'image/png'});
}
