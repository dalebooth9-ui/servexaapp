import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { normaliseDestination } from '@/lib/assistantDestinations';
// Only reveal navigation controls. Never click a tool's command button.
export default function AssistantNavigation(){
  const location=useLocation();
  useEffect(()=>{
    const params=new URLSearchParams(location.search);const focus=params.get('focus');
    if(!focus)return;
    let finished=false;let highlight:HTMLElement|null=null;let timer:ReturnType<typeof setTimeout>|undefined;let settle:ReturnType<typeof setTimeout>|undefined;
    const reveal=()=>{
      if(finished)return;
      const root=document.querySelector('main');if(!root)return;
      const tab=params.get('tab');
      if(tab){const tabs=Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));const selected=tabs.find(t=>t.dataset.assistantTab===tab||normaliseDestination(t.textContent||'')===normaliseDestination(tab));if(selected?.getAttribute('aria-selected')==='false'){selected.click();return;}}
      const section=params.get('section');
      if(section){const disclosure=Array.from(root.querySelectorAll<HTMLElement>('button[data-state="closed"][aria-expanded="false"][aria-controls]')).find(el=>normaliseDestination(el.textContent||'')===normaliseDestination(section));if(disclosure){disclosure.click();return;}}
      const nodes=Array.from(root.querySelectorAll<HTMLElement>('[data-assistant-target],h1,h2,h3,h4,h5,label,[role="tab"],button'));
      const key=normaliseDestination(focus);
      const target=nodes.find(el=>normaliseDestination(el.dataset.assistantTarget||el.textContent||'')===key&&el.getClientRects().length>0);
      if(!target)return;
      if(target.matches('button[data-state="closed"][aria-expanded="false"][aria-controls]')){target.click();return;}
      highlight=target.matches('h2,h3,h4,h5')?(target.closest<HTMLElement>('[data-assistant-target],.rounded-lg.border')||target):target;
      highlight.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
      highlight.classList.add('assistant-destination-highlight');
      highlight.setAttribute('tabindex','-1');highlight.focus({preventScroll:true});
      // Re-centre after lazy card content and disclosure animations finish.
      settle=setTimeout(()=>highlight?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'}),400);
      finished=true;timer=setTimeout(()=>highlight?.classList.remove('assistant-destination-highlight'),2400);
    };
    const observer=new MutationObserver(reveal);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-state','aria-selected']});
    const interval=setInterval(reveal,150);reveal();const stop=setTimeout(()=>{observer.disconnect();clearInterval(interval);},12000);
    return()=>{observer.disconnect();clearInterval(interval);clearTimeout(stop);if(timer)clearTimeout(timer);if(settle)clearTimeout(settle);highlight?.classList.remove('assistant-destination-highlight');};
  },[location.pathname,location.search,location.key]);
  return null;
}