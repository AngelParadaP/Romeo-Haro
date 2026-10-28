"use client";
import {useEffect} from 'react';
let locks=0;
let restore:(()=>void)|null=null;

// iOS needs a fixed body to stop background scrolling behind a fixed dialog.
// Reference counting also handles nested dialogs and Strict Mode cleanups.
export function useModalScrollLock(active=true){
  useEffect(()=>{
    if(!active)return;
    if(locks===0){
      const body=document.body;const y=window.scrollY;
      const saved={position:body.style.position,top:body.style.top,left:body.style.left,right:body.style.right,width:body.style.width,overflow:body.style.overflow};
      Object.assign(body.style,{position:'fixed',top:`-${y}px`,left:'0',right:'0',width:'100%',overflow:'hidden'});
      restore=()=>{Object.assign(body.style,saved);const end=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);window.scrollTo(0,Math.min(y,end));};
    }
    locks++;
    return()=>{locks--;if(locks===0){restore?.();restore=null;}};
  },[active]);
}
