(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  // Same public Supabase project/account as English; fitness has its own
  // local session, revisions, backups and namespaced cloud payload.
  const client = window.fitCloud = new BarkalooFitCloud({
    url: "https://jhvqlhwoiyyuzsekwqut.supabase.co",
    key: "sb_publishable_gDyhq1WBrANw3kNdMSR7nQ_492sYBxF",
    read:()=>FitApp.read(),
    apply:value=>FitApp.apply(value),
    onChange(view){
      $('cloudAuthForm').hidden=!!view.session;$('cloudLoggedIn').hidden=!view.session;
      $('cloudUser').textContent=view.session?.user?.email||'';
      $('cloudStatus').textContent=view.message;
      $('cloudStatus').style.color=['error','conflict'].includes(view.phase)?'var(--bad)':'';
      $('cloudConflict').hidden=!view.conflict;
      $('cloudUseCloud').disabled=!view.conflict?.row;
      $('cloudBackup').hidden=!view.hasBackup;$('cloudOriginalBackup').hidden=!view.hasOriginalBackup;
      $('cloudSyncNow').disabled=view.phase==='syncing';
    }
  });
  async function authenticate(signUp){
    if(!$('cloudAuthForm').reportValidity())return;
    $('cloudSignIn').disabled=$('cloudSignUp').disabled=true;
    client.notify('auth',signUp?'Создаём аккаунт…':'Входим…');
    try{await client[signUp?'signUp':'signIn']($('cloudEmail').value.trim(),$('cloudPassword').value);}
    catch(error){client.notify('error','Не удалось войти: '+error.message);}
    finally{$('cloudPassword').value='';$('cloudSignIn').disabled=$('cloudSignUp').disabled=false;}
  }
  $('cloudAuthForm').onsubmit=e=>{e.preventDefault();authenticate(false);};
  $('cloudSignUp').onclick=()=>authenticate(true);
  $('cloudSignOut').onclick=()=>client.signOut();$('cloudSyncNow').onclick=()=>client.sync();
  $('cloudUseLocal').onclick=()=>client.sync('local');$('cloudUseCloud').onclick=()=>client.sync('cloud');
  $('cloudBackup').onclick=()=>client.downloadBackup();$('cloudOriginalBackup').onclick=()=>client.downloadBackup(true);
  client.notify('local','Войдите в один аккаунт на телефоне и компьютере');
  if(client.session)client.sync();
  window.addEventListener('online',()=>client.sync());
  window.addEventListener('offline',()=>{if(client.session)client.notify('offline','Нет сети. Данные сохранены на устройстве');});
  window.addEventListener('focus',()=>{if(!document.hidden)client.sync();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)client.sync();});
  setInterval(()=>{if(!document.hidden&&client.session)client.sync();},15000);
})();
