(() => {
  'use strict';
  const $ = (s,r=document) => r.querySelector(s);
  const $$ = (s,r=document) => [...r.querySelectorAll(s)];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const menuButton = $('.menu-toggle');
  const nav = $('#main-nav');
  function closeMenu(){nav.classList.remove('is-open');menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','メニューを開く');}
  menuButton.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'メニューを閉じる':'メニューを開く');});
  nav.addEventListener('click',event=>{if(event.target.closest('a'))closeMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
  document.addEventListener('click',event=>{if(!event.target.closest('.site-header'))closeMenu();});
  const viewport=$('.carousel-viewport'), showcase=$('.showcase'), pause=$('[data-pause]'), spin=$('[data-spin]');
  const prev=$('[data-prev]'), next=$('[data-next]');
  let userPaused=false, offscreen=false;
  function motionState(){const isPaused=userPaused||reduced.matches||offscreen||document.hidden;showcase.classList.toggle('is-paused',isPaused);pause.setAttribute('aria-pressed',String(userPaused||reduced.matches));pause.setAttribute('aria-label',userPaused?'スマホの動きを再開':'スマホの動きを停止');pause.disabled=reduced.matches;spin.disabled=reduced.matches;}
  pause.addEventListener('click',()=>{userPaused=!userPaused;motionState();});
  reduced.addEventListener('change',motionState);
  document.addEventListener('visibilitychange',motionState);
  new IntersectionObserver(([entry])=>{offscreen=!entry.isIntersecting;motionState();},{threshold:0}).observe(showcase);
  const cardStep=()=>$('.sample-item').getBoundingClientRect().width+parseFloat(getComputedStyle($('.sample-track')).gap);
  function move(direction){viewport.scrollBy({left:direction*cardStep()*Math.max(1,Math.floor(viewport.clientWidth/cardStep())-1),behavior:reduced.matches?'instant':'smooth'});}
  prev.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
  function updateArrows(){prev.disabled=viewport.scrollLeft<2;next.disabled=viewport.scrollLeft+viewport.clientWidth>=viewport.scrollWidth-3;}
  viewport.addEventListener('scroll',updateArrows,{passive:true});window.addEventListener('resize',updateArrows);
  viewport.addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}});
  spin.addEventListener('click',()=>{if(reduced.matches)return;const box=viewport.getBoundingClientRect();$$('.phone').forEach(phone=>{const bounds=phone.getBoundingClientRect();if(bounds.right>box.left&&bounds.left<box.right){phone.classList.remove('is-spinning');void phone.offsetWidth;phone.classList.add('is-spinning');}});});
  $$('.phone').forEach(phone=>phone.addEventListener('animationend',event=>{if(event.animationName==='phone-spin')phone.classList.remove('is-spinning');}));
  let drag=null, suppressClick=false;
  viewport.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button!==0)return;drag={id:event.pointerId,x:event.clientX,left:viewport.scrollLeft,moved:false};suppressClick=false;});
  viewport.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;const delta=event.clientX-drag.x;if(Math.abs(delta)>7){drag.moved=true;viewport.classList.add('is-dragging');viewport.setPointerCapture(event.pointerId);viewport.scrollLeft=drag.left-delta;event.preventDefault();}});
  function endDrag(event){if(!drag||drag.id!==event.pointerId)return;suppressClick=drag.moved;drag=null;viewport.classList.remove('is-dragging');if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);setTimeout(()=>suppressClick=false,0);}
  viewport.addEventListener('pointerup',endDrag);viewport.addEventListener('pointercancel',endDrag);
  viewport.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();}},true);
  const dialog=$('.sample-dialog'), preview=$('.dialog-preview');
  let lastFocus=null;
  const categories={sola:'cafe',lumiere:'salon',kokoro:'retail',atelier:'architecture',komorebi:'restaurant',nagi:'wellness',table:'restaurant',luce:'salon',natura:'retail'};
  function closeDialog(){dialog.close();}
  $$('.sample-trigger').forEach(button=>button.addEventListener('click',()=>{if(suppressClick)return;const sampleId=button.dataset.sample;const title=$('.sample-nav b',button).textContent;$('#dialog-title').textContent=title;$('.dialog-category').textContent=$('.sample-caption',button).textContent.trim();preview.replaceChildren($('.sample-screen',button).cloneNode(true));lastFocus=button;document.body.classList.add('modal-open');dialog.showModal();document.dispatchEvent(new CustomEvent('onebe:sample-detail',{detail:{sampleId,category:categories[sampleId]}}));}));
  $('.dialog-close').addEventListener('click',closeDialog);
  dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)closeDialog();}});
  dialog.addEventListener('close',()=>{document.body.classList.remove('modal-open');lastFocus?.focus({preventScroll:true});});
  const mobile=$('.mobile-cta'), hero=$('.hero');
  new IntersectionObserver(([entry])=>{mobile.classList.toggle('visible',!entry.isIntersecting&&entry.boundingClientRect.top<0);},{threshold:0}).observe(hero);
  motionState();updateArrows();
})();

