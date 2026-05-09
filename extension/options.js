document.addEventListener('DOMContentLoaded', async () => {
  const settings = await chrome.storage.sync.get(['psiKey']);
  if (settings.psiKey) document.getElementById('psi-key').value = settings.psiKey;

  document.getElementById('save').addEventListener('click', async () => {
    const psiKey = document.getElementById('psi-key').value.trim();
    await chrome.storage.sync.set({ psiKey });
    const s = document.getElementById('status');
    s.textContent = '✓ 저장됨';
    setTimeout(() => { s.textContent = ''; }, 1800);
  });
});
