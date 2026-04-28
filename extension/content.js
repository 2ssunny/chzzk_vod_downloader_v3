// Create a floating button
const btn = document.createElement('button');
btn.innerHTML = '⬇️ 앱으로 다운로드';
btn.style.position = 'fixed';
btn.style.bottom = '20px';
btn.style.right = '20px';
btn.style.zIndex = '999999';
btn.style.padding = '10px 16px';
btn.style.backgroundColor = '#00ffa3';
btn.style.color = '#000000';
btn.style.border = 'none';
btn.style.borderRadius = '8px';
btn.style.fontWeight = 'bold';
btn.style.fontSize = '14px';
btn.style.cursor = 'pointer';
btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
btn.style.transition = 'all 0.2s ease';

function updateButtonVisibility() {
  const href = window.location.href;
  const isTarget = href.includes('/video/') || href.includes('/clips/');
  btn.style.display = isTarget ? 'block' : 'none';
}

btn.addEventListener('mouseenter', () => {
  btn.style.transform = 'translateY(-2px)';
  btn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
});

btn.addEventListener('mouseleave', () => {
  btn.style.transform = 'translateY(0)';
  btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
});

btn.addEventListener('click', async () => {
  const url = window.location.href;
  const originalText = btn.innerHTML;
  
  try {
    btn.innerHTML = '⏳ 전송 중...';
    btn.style.backgroundColor = '#f39c12';
    
    const response = await fetch('http://127.0.0.1:11025/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url })
    });
    
    if (response.ok) {
      btn.innerHTML = '✅ 전송 완료!';
      btn.style.backgroundColor = '#2ecc71';
    } else {
      throw new Error('Server returned ' + response.status);
    }
  } catch (error) {
    btn.innerHTML = '❌ 전송 실패 (앱 실행 확인)';
    btn.style.backgroundColor = '#e74c3c';
    btn.style.color = 'white';
    console.error('Chzzk Downloader Extension Error:', error);
  }
  
  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.style.backgroundColor = '#00ffa3';
    btn.style.color = '#000000';
  }, 3000);
});

// Add to page
document.body.appendChild(btn);

// SPA URL change detection
let lastUrl = location.href; 
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    updateButtonVisibility();
  }
}).observe(document, {subtree: true, childList: true});

// Initial check
updateButtonVisibility();
