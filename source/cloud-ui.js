// Public browser key. Access to rows must be enforced by user JWTs and RLS.
cloudSyncClient = new BarkalooCloud({
  url: 'https://jhvqlhwoiyyuzsekwqut.supabase.co',
  key: 'sb_publishable_gDyhq1WBrANw3kNdMSR7nQ_492sYBxF',
  read: buildBackup,
  apply: restoreBackupObject,
  onChange(view) {
    document.getElementById('cloudAuthForm').hidden = !!view.session;
    document.getElementById('cloudLoggedIn').hidden = !view.session;
    document.getElementById('cloudUser').textContent = view.session?.user?.email || '';
    const status = document.getElementById('cloudStatus');
    status.textContent = view.message;
    status.style.color = view.phase === 'error' || view.phase === 'conflict' ? 'var(--bad)' : '';
    document.getElementById('cloudConflict').hidden = !view.conflict;
    document.getElementById('cloudUseCloud').disabled = !view.conflict?.row;
    document.getElementById('cloudUseLocal').textContent = view.conflict?.reason === 'account'
      ? 'Перенести данные в этот аккаунт' : 'Сохранить версию этого устройства';
    document.getElementById('cloudBackup').hidden = !view.hasBackup;
    document.getElementById('cloudOriginalBackup').hidden = !view.hasOriginalBackup;
    document.getElementById('cloudSyncNow').disabled = view.phase === 'syncing';
  }
});
async function cloudAuthenticate(createAccount) {
  const form = document.getElementById('cloudAuthForm');
  if (!form.reportValidity()) return;
  const email = document.getElementById('cloudEmail').value.trim();
  const password = document.getElementById('cloudPassword');
  const signIn = document.getElementById('cloudSignIn');
  const signUp = document.getElementById('cloudSignUp');
  signIn.disabled = signUp.disabled = true;
  cloudSyncClient.notify('auth', createAccount ? 'Создание аккаунта…' : 'Вход…');
  try {
    if (createAccount) await cloudSyncClient.signUp(email, password.value);
    else await cloudSyncClient.signIn(email, password.value);
  } catch (error) {
    cloudSyncClient.notify('error', 'Не удалось войти: ' + error.message);
  } finally {
    password.value = '';
    signIn.disabled = signUp.disabled = false;
  }
}
document.getElementById('cloudAuthForm').onsubmit = event => { event.preventDefault(); cloudAuthenticate(false); };
document.getElementById('cloudSignUp').onclick = () => cloudAuthenticate(true);
document.getElementById('cloudSignOut').onclick = () => cloudSyncClient.signOut();
document.getElementById('cloudSyncNow').onclick = () => cloudSyncClient.sync();
document.getElementById('cloudUseCloud').onclick = () => cloudSyncClient.sync('cloud');
document.getElementById('cloudUseLocal').onclick = () => cloudSyncClient.sync('local');
document.getElementById('cloudBackup').onclick = () => cloudSyncClient.downloadBackup();
document.getElementById('cloudOriginalBackup').onclick = () => cloudSyncClient.downloadBackup(true);
cloudSyncClient.notify('local', 'Войдите в один аккаунт на телефоне и компьютере');
if (cloudSyncClient.session) cloudSyncClient.sync();
window.addEventListener('online', () => cloudSyncClient.sync());
window.addEventListener('offline', () => {
  if (cloudSyncClient.session) cloudSyncClient.notify('offline', 'Нет сети. Прогресс сохранён на устройстве');
});
window.addEventListener('focus', () => { if (!document.hidden) cloudSyncClient.sync(); });
document.addEventListener('visibilitychange', () => cloudSyncClient.sync());
setInterval(() => { if (!document.hidden) cloudSyncClient.sync(); }, 15000);
