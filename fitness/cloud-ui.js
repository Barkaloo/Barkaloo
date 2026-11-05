(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  // Same public Supabase project/account as English; fitness has its own
  // local session, revisions, backups and namespaced cloud payload.
  const client = window.fitCloud = new BarkalooFitCloud({
    url: "https://jhvqlhwoiyyuzsekwqut.supabase.co",
    key: "sb_publishable_gDyhq1WBrANw3kNdMSR7nQ_492sYBxF",
    redirectTo: new URL('/fitness/', location.origin).href,
    read:()=>FitApp.read(),
    apply:value=>FitApp.apply(value),
    onChange(view){
      $('cloudAuthHint').hidden=!!view.session;$('cloudPanel').dataset.phase=view.phase;$('cloudAuthForm').hidden=!!view.session;$('cloudLoggedIn').hidden=!view.session;
      $('cloudUser').textContent=view.session?.user?.email||'';
      $('cloudStatus').textContent=view.message;
      $('cloudStatus').style.color=['error','conflict'].includes(view.phase)?'var(--bad)':'';
      $('cloudConflict').hidden=!view.conflict;
      $('cloudUseCloud').disabled=!view.conflict?.row;
      $('cloudBackup').hidden=!view.hasBackup;$('cloudOriginalBackup').hidden=!view.hasOriginalBackup;
      $('cloudSyncNow').disabled=view.phase==='syncing';
    }
  });
  let authBusy=false;
  function resendButton(){
    const seconds=Math.max(0,Math.ceil((client.emailCooldownUntil-Date.now())/1000));
    $('cloudResend').disabled=authBusy||seconds>0;
    $('cloudResend').textContent=seconds>0?`Повторная отправка через ${seconds} с`:'Отправить письмо повторно';
  }
  function authError(error){
    if(error.code==='email_not_confirmed')return 'Почта ещё не подтверждена. Проверьте входящие и спам или отправьте письмо повторно.';
    if(error.code==='over_email_send_rate_limit')return 'Лимит отправки писем исчерпан. Попробуйте позже.';
    if(error.status===429||error.code==='over_request_rate_limit')return 'Слишком много попыток. Попробуйте позже.';
    if(error.code==='local_email_cooldown')return `Повторите отправку через ${error.retryAfter} с.`;
    if(error.code==='email_address_not_authorized')return 'Письма на этот адрес сейчас не отправляются. Нужна проверка почтовых настроек сервиса.';
    if(error.code==='user_already_exists')return 'Аккаунт уже существует. Нажмите «Войти».';
    if(error.code==='invalid_credentials')return 'Неверная почта или пароль.';
    return error.message;
  }
  async function authenticate(signUp){
    if(!$('cloudAuthForm').reportValidity())return;
    authBusy=true;resendButton();$('cloudSignIn').disabled=$('cloudSignUp').disabled=true;
    client.notify('auth',signUp?'Создаём аккаунт…':'Входим…');
    try{await client[signUp?'signUp':'signIn']($('cloudEmail').value.trim(),$('cloudPassword').value);}
    catch(error){if(signUp&&error.status===429)client.emailCooldownUntil=Date.now()+Math.max(60,error.retryAfter||0)*1000;client.notify('error',(signUp?'Не удалось зарегистрироваться: ':'Не удалось войти: ')+authError(error));}
    finally{$('cloudPassword').value='';authBusy=false;resendButton();$('cloudSignIn').disabled=$('cloudSignUp').disabled=false;}
  }
  $('cloudResend').onclick=async()=>{
    if(!$('cloudEmail').reportValidity())return;
    authBusy=true;resendButton();$('cloudSignIn').disabled=$('cloudSignUp').disabled=true;
    client.notify('auth','Запрашиваем повторное письмо…');
    try{await client.resendConfirmation($('cloudEmail').value.trim());}
    catch(error){client.notify('error','Не удалось запросить письмо: '+authError(error));}
    finally{authBusy=false;resendButton();$('cloudSignIn').disabled=$('cloudSignUp').disabled=false;}
  };
  resendButton();setInterval(resendButton,1000);
  $('cloudAuthForm').onsubmit=e=>{e.preventDefault();authenticate(false);};
  $('cloudSignUp').onclick=()=>authenticate(true);
  $('cloudSignOut').onclick=()=>client.signOut();$('cloudSyncNow').onclick=()=>client.sync();
  $('cloudUseLocal').onclick=()=>client.sync('local');$('cloudUseCloud').onclick=()=>client.sync('cloud');
  $('cloudBackup').onclick=()=>client.downloadBackup();$('cloudOriginalBackup').onclick=()=>client.downloadBackup(true);
  client.notify('local','Войдите в один аккаунт на телефоне и компьютере');
  function handleCallback(){
    const fragment=location.hash;
    if(!/(?:access_token=|error_description=|(?:^#|&)error=)/.test(fragment))return false;
    // Remove credentials from the address/history before verifying the user.
    history.replaceState({},'',location.pathname+location.search+'#/home');
    client.consumeCallback(fragment);
    return true;
  }
  window.addEventListener('hashchange',handleCallback);
  if(!handleCallback()&&client.session)client.sync();
  window.addEventListener('online',()=>client.sync());
  window.addEventListener('offline',()=>{if(client.session)client.notify('offline','Нет сети. Данные сохранены на устройстве');});
  window.addEventListener('focus',()=>{if(!document.hidden)client.sync();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)client.sync();});
  setInterval(()=>{if(!document.hidden&&client.session)client.sync();},15000);
})();
