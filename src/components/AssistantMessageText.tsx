import { Fragment } from 'react';
import { messageDestinations, safeAssistantUrl } from '@/lib/assistantDestinations';
export default function AssistantMessageText({text,actions,currentPath,onNavigate}:{text:string;actions:{label:string;url:string}[];currentPath:string;onNavigate:(url:string,label:string)=>void}){
  const candidates=messageDestinations(text,actions,currentPath);
  const renderPlain=(value:string,key:string)=>{
    const parts=[];let cursor=0;
    while(cursor<value.length){
      const matches=candidates.map(c=>({...c,index:value.toLowerCase().indexOf(c.label.toLowerCase(),cursor)})).filter(c=>c.index>=0&&(c.index===0||!/[a-z0-9]/i.test(value[c.index-1]))&&(c.index+c.label.length===value.length||!/[a-z0-9]/i.test(value[c.index+c.label.length]))).sort((a,b)=>a.index-b.index||b.label.length-a.label.length);
      const match=matches[0];if(!match){parts.push(value.slice(cursor));break;}
      parts.push(value.slice(cursor,match.index));parts.push(<a key={`${key}:${match.index}`} href={match.url} className="font-medium text-primary underline underline-offset-2 break-words" onClick={e=>{e.preventDefault();onNavigate(match.url,match.label);}}>{value.slice(match.index,match.index+match.label.length)}</a>);cursor=match.index+match.label.length;
    }return parts;
  };
  const chunks=text.split(/(\[[^\]]+\]\([^\s)]+\))/g);
  return <div className="whitespace-pre-wrap break-words">{chunks.map((chunk,i)=>{const markdown=chunk.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);if(markdown){return safeAssistantUrl(markdown[2])?<a key={i} href={markdown[2]} className="font-medium text-primary underline underline-offset-2" onClick={e=>{e.preventDefault();onNavigate(markdown[2],markdown[1]);}}>{markdown[1]}</a>:<Fragment key={i}>{markdown[1]}</Fragment>;}return <Fragment key={i}>{renderPlain(chunk.replace(/\*\*/g,''),String(i))}</Fragment>;})}</div>;
}