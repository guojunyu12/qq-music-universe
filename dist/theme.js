export const themes = {green:{accent:'#5cf08a',background:'#07120d',label:'音乐绿'},silver:{accent:'#d5dfdf',background:'#0e1013',label:'月光银'},pink:{accent:'#f3a5bc',background:'#1a0d10',label:'落日粉'}};
export function setTheme(name) {
  const theme=themes[name]; if(!theme)return;
  document.body.dataset.theme=name;
  document.querySelector('meta[name="theme-color"]').content=theme.background;
  document.querySelectorAll('button[data-theme]').forEach(button=>{
    const active=button.dataset.theme===name;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));
  });
  window.dispatchEvent(new CustomEvent('music-theme',{detail:theme}));
}
document.querySelectorAll('button[data-theme]').forEach(button=>button.addEventListener('click',()=>setTheme(button.dataset.theme)));
