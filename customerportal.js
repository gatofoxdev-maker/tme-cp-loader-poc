define([], function () {
  function injectRickroll() {
    var marker = {
      executed: true,
      ts: new Date().toISOString(),
      origin: window.location.origin,
      href: window.location.href
    };

    window.__CP_POC_MARKER__ = marker;
    try {
      localStorage.setItem('cp_poc_marker', JSON.stringify(marker));
    } catch (e) {}

    var existing = document.getElementById('cp-youtube-poc-frame');
    if (existing) {
      return marker;
    }

    var iframe = document.createElement('iframe');
    iframe.id = 'cp-youtube-poc-frame';
    iframe.src = 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&playsinline=1&rel=0';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.width = '100vw';
    iframe.style.height = '100vh';
    iframe.style.zIndex = '2147483647';
    iframe.style.border = '0';
    iframe.style.background = '#000';

    document.documentElement.appendChild(iframe);
    return marker;
  }

  injectRickroll();

  return {
    version: '99.99.99-youtube-poc',
    render: function () {
      return injectRickroll();
    }
  };
});
