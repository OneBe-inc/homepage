(() => {
  'use strict';
  const $ = (s,r=document) => r.querySelector(s);
  const $$ = (s,r=document) => [...r.querySelectorAll(s)];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const menuButton = $('.menu-toggle');
  const nav = $('#main-nav');
  const menuMedia=window.matchMedia('(max-width: 800px)');
  function setMenu(open){
    nav.classList.toggle('is-open',open);
    menuButton.setAttribute('aria-expanded',String(open));
    menuButton.setAttribute('aria-label',open?'メニューを閉じる':'メニューを開く');
    nav.inert=menuMedia.matches&&!open;
  }
  function closeMenu(){setMenu(false);}
  menuButton.addEventListener('click',()=>setMenu(!nav.classList.contains('is-open')));
  nav.addEventListener('click',event=>{if(event.target.closest('a'))closeMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&nav.classList.contains('is-open')){closeMenu();menuButton.focus();}});
  document.addEventListener('click',event=>{if(!event.target.closest('.site-header'))closeMenu();});
  menuMedia.addEventListener('change',closeMenu);
  closeMenu();
  // Native horizontal scrolling drives a circular arc in 3D space.
  const viewport=$('.carousel-viewport'), showcase=$('.showcase');
  const pause=$('[data-pause]'), spin=$('[data-spin]');
  const prev=$('[data-prev]'), next=$('[data-next]');
  const items=$$('.sample-item'), total=items.length, step=260, cycle=total*step;
  let userPaused=false, offscreen=false, hovering=false, interacting=false;
  let holdUntil=0, drag=null, suppressClick=false, frame=0, lastTime=0, spinTrip=null;
  let radius=690, drift=0;
  const wrap=(n,m)=>((n%m)+m)%m;
  function isPaused(){return userPaused||reduced.matches||offscreen||document.hidden||hovering||interacting||viewport.contains(document.activeElement)||document.body.classList.contains('modal-open');}
  function paint(){
    const phase=wrap(viewport.scrollLeft/step,total);
    items.forEach((item,i)=>{
      const distance=wrap(i-phase+total/2,total)-total/2;
      const angle=distance*24, radians=angle*Math.PI/180;
      const x=Math.sin(radians)*radius, depth=(1-Math.cos(radians))*radius;
      const inArc=Math.abs(angle)<83;
      const projectedX=x*2200/(2200-depth);
      const reachable=inArc&&Math.abs(projectedX)<viewport.clientWidth/2+item.offsetWidth*.35;
      item.style.transform=`translate3d(${x.toFixed(2)}px,${(-depth*.045).toFixed(2)}px,${depth.toFixed(2)}px) rotateY(${-angle.toFixed(2)}deg)`;
      item.style.opacity=inArc?String(Math.min(1,(83-Math.abs(angle))/10)):0;
      item.style.visibility=inArc?'visible':'hidden';
      item.inert=!reachable;
      item.setAttribute('aria-hidden',String(!reachable));
    });
    $('.orbit-counter').textContent=String(wrap(Math.round(phase),total)+1).padStart(2,'0')+' / '+String(total).padStart(2,'0');
    showcase.dataset.activeSample=String(wrap(Math.round(phase),total));
  }
  function recenter(){
    if(viewport.scrollLeft<cycle*2||viewport.scrollLeft>cycle*38){
      const previous=viewport.scrollLeft;
      viewport.scrollLeft=cycle*20+wrap(previous,cycle);
      if(drag)drag.left+=viewport.scrollLeft-previous;
    }
  }
  function geometry(){
    radius=innerWidth<=560?490:innerWidth<=800?570:innerWidth>=1600?770:690;
    viewport.style.setProperty('--orbit-viewport-width',viewport.clientWidth+'px');
    viewport.style.setProperty('--orbit-scroll-width',(viewport.clientWidth+cycle*40)+'px');
    showcase.classList.add('orbit-ready');paint();
  }
  function frameLoop(now){
    const elapsed=Math.min(now-lastTime,48);lastTime=now;
    if(spinTrip&&!offscreen&&!document.hidden&&!reduced.matches){
      const t=Math.min(1,(now-spinTrip.started)/6500);
      viewport.scrollLeft=spinTrip.from+cycle*(t*t*(3-2*t));
      if(t===1){spinTrip=null;spin.setAttribute('aria-pressed','false');}
    }else if(!isPaused()&&now>holdUntil){drift+=elapsed*.026;if(drift>=1){const pixels=Math.floor(drift);viewport.scrollLeft+=pixels;drift-=pixels;}}
    frame=requestAnimationFrame(frameLoop);
  }
  function motionState(){
    if(reduced.matches||userPaused){spinTrip=null;spin.setAttribute('aria-pressed','false');}
    pause.setAttribute('aria-pressed',String(userPaused||reduced.matches));
    pause.setAttribute('aria-label',userPaused?'円形サンプルの自動回転を再開':'円形サンプルの自動回転を停止');
    pause.disabled=reduced.matches;spin.disabled=reduced.matches;
  }
  function move(direction){
    spinTrip=null;spin.setAttribute('aria-pressed','false');holdUntil=performance.now()+7000;
    viewport.scrollTo({left:(Math.round(viewport.scrollLeft/step)+direction)*step,behavior:reduced.matches?'instant':'smooth'});
  }
  pause.addEventListener('click',()=>{userPaused=!userPaused;motionState();});
  spin.addEventListener('click',()=>{if(reduced.matches)return;spinTrip=spinTrip?null:{from:viewport.scrollLeft,started:performance.now()};spin.setAttribute('aria-pressed',String(!!spinTrip));});
  prev.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
  viewport.addEventListener('scroll',()=>{recenter();paint();},{passive:true});
  viewport.addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}});
  viewport.addEventListener('wheel',()=>{spinTrip=null;holdUntil=performance.now()+7000;},{passive:true});
  showcase.addEventListener('mouseenter',()=>{hovering=true;});showcase.addEventListener('mouseleave',()=>{hovering=false;});
  viewport.addEventListener('pointerdown',event=>{
    spinTrip=null;interacting=true;holdUntil=performance.now()+7000;
    if(event.pointerType!=='mouse'||event.button!==0)return;
    drag={id:event.pointerId,x:event.clientX,left:viewport.scrollLeft,moved:false};suppressClick=false;
  });
  viewport.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const delta=event.clientX-drag.x;
    if(Math.abs(delta)>7){drag.moved=true;viewport.classList.add('is-dragging');viewport.setPointerCapture(event.pointerId);viewport.scrollLeft=drag.left-delta;event.preventDefault();}
  });
  function endDrag(event){
    interacting=false;
    if(!drag||drag.id!==event.pointerId)return;
    suppressClick=drag.moved;drag=null;viewport.classList.remove('is-dragging');
    if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);
    setTimeout(()=>suppressClick=false,0);
  }
  viewport.addEventListener('pointerup',endDrag);viewport.addEventListener('pointercancel',endDrag);
  viewport.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();}},true);
  reduced.addEventListener('change',motionState);
  new IntersectionObserver(([entry])=>{offscreen=!entry.isIntersecting;},{threshold:0}).observe(showcase);
  window.addEventListener('resize',geometry);
  document.addEventListener('visibilitychange',()=>{lastTime=performance.now();});
  window.addEventListener('pagehide',()=>cancelAnimationFrame(frame));
  window.addEventListener('pageshow',event=>{if(event.persisted){lastTime=performance.now();frame=requestAnimationFrame(frameLoop);}});
  geometry();viewport.scrollLeft=cycle*20;paint();motionState();
  lastTime=performance.now();frame=requestAnimationFrame(frameLoop);

  const dialog=$('.sample-dialog'), preview=$('.dialog-preview');
  let lastFocus=null;
  const categories={sola:'cafe',lumiere:'salon',kokoro:'retail',atelier:'architecture',komorebi:'restaurant',nagi:'wellness',table:'restaurant',luce:'salon',natura:'retail'};
  function closeDialog(){dialog.close();}
  $$('.sample-trigger').forEach(button=>button.addEventListener('click',()=>{if(suppressClick)return;const sampleId=button.dataset.sample;const title=$('.sample-nav b',button).textContent;$('#dialog-title').textContent=title;$('.dialog-category').textContent=$('.sample-caption',button).textContent.trim();preview.replaceChildren($('.sample-screen',button).cloneNode(true));lastFocus=button;document.body.classList.add('modal-open');dialog.showModal();document.dispatchEvent(new CustomEvent('onebe:sample-detail',{detail:{sampleId,category:categories[sampleId]}}));}));
  $('.dialog-close').addEventListener('click',closeDialog);
  dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)closeDialog();}});
  dialog.addEventListener('close',()=>{document.body.classList.remove('modal-open');lastFocus?.focus({preventScroll:true});});
  const mobile=$('.mobile-cta'), hero=$('.hero');
  new IntersectionObserver(([entry])=>{const visible=!entry.isIntersecting&&entry.boundingClientRect.top<0;mobile.classList.toggle('visible',visible);mobile.setAttribute('aria-hidden',String(!visible));mobile.tabIndex=visible?0:-1;},{threshold:0}).observe(hero);

})();
