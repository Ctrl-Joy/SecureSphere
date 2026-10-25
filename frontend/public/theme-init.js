// Applies the saved theme before first paint (external file so the CSP needs no 'unsafe-inline').
try {
  var t = localStorage.getItem('ss-theme')
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t)
} catch (e) {
  /* storage unavailable: keep default */
}
