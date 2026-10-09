'use strict'
;(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)')
  var $ = function (s, r) { return (r || document).querySelector(s) }
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)) }

  /* nav border, reveal on scroll */
  var nav = $('#nav')
  addEventListener('scroll', function () { nav.classList.toggle('stuck', scrollY > 8) }, { passive: true })
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } })
  }, { threshold: 0.12 })
  $$('.rv, #term').forEach(function (n) { io.observe(n) })

  /* copy buttons */
  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var el = document.getElementById(btn.getAttribute('data-copy'))
      var done = function (t) { btn.textContent = t; setTimeout(function () { btn.textContent = 'Copy' }, 2000) }
      navigator.clipboard.writeText(el.textContent).then(function () { done('Copied') }).catch(function () {
        var r = document.createRange(); r.selectNodeContents(el)
        var s = getSelection(); s.removeAllRanges(); s.addRange(r); done('Select')
      })
    })
  })

  /* open accordions from hash or from links */
  function openFor(id) {
    var t = document.getElementById(id)
    if (t && t.tagName === 'DETAILS') t.open = true
  }
  function fromHash() { openFor(location.hash.slice(1)) }
  addEventListener('hashchange', fromHash); fromHash()
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function () { openFor(a.getAttribute('href').slice(1)) })
  })

  /* connection explorer */
  ;(function () {
    var data = {
      usb: {
        phone: 'USB debugging',
        steps: ['Turn on Developer options, then <b>USB debugging</b>.', 'Plug in a USB data cable.', 'Tap <b>Allow</b> on the phone, once.'],
        meta: [['Speed', 'Full USB bandwidth'], ['Phone setup', 'USB debugging'], ['Android', '8.0 or later'], ['Features', 'Everything']]
      },
      wifi: {
        phone: 'Wireless debugging',
        steps: ['Turn on <b>Wireless debugging</b> (Android 11+).', 'Pair once with a QR code or a 6-digit code.', 'Keep both devices on the same Wi-Fi network.'],
        meta: [['Speed', 'Depends on your network'], ['Phone setup', 'Wireless debugging'], ['Android', '11 or later'], ['Features', 'Everything']]
      },
      mtp: {
        phone: 'Not in this release',
        steps: ['MTP is deferred and is not part of this beta.', 'The app contains no MTP component, so there is nothing to select.', 'Use <b>USB</b> or <b>Wi-Fi</b>.'],
        meta: [['Status', 'Deferred'], ['Included in 1.4.x', 'No'], ['Use instead', 'USB or Wi-Fi'], ['Features', 'None in this mode']]
      }
    }
    var order = ['usb', 'wifi', 'mtp']
    var tabs = $$('.xp-tab'), groups = $$('.g-mode'), steps = $('#xp-steps'), meta = $('#xp-meta')
    var caps = $$('.cap'), count = $('#caps-count'), lbl = $('#phone-lbl'), root = $('#xp')
    var cur = 0, timer, auto = !reduce.matches, inView = false, dur = 6500
    if (reduce.matches) { var svg = $('#xp-svg'); if (svg.pauseAnimations) svg.pauseAnimations() }
    function show(i) {
      cur = i
      var m = order[i], d = data[m]
      tabs.forEach(function (t, k) {
        t.classList.remove('on', 'still'); t.setAttribute('aria-selected', String(k === i))
        t.style.setProperty('--dur', dur / 1000 + 's')
        if (k === i) { void t.offsetWidth; t.classList.add('on'); if (!auto) t.classList.add('still') }
      })
      groups.forEach(function (g) { g.classList.toggle('on', g.getAttribute('data-m') === m) })
      lbl.textContent = d.phone
      steps.innerHTML = d.steps.map(function (s) { return '<div><span>' + s + '</span></div>' }).join('')
      meta.innerHTML = d.meta.map(function (r) { return '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>' }).join('')
      var n = 0
      caps.forEach(function (c) {
        var off = m === 'mtp' && c.getAttribute('data-g') === 'b'
        c.classList.toggle('off', off); if (!off) n++
      })
      count.innerHTML = '<b>' + n + '</b> of ' + caps.length + ' available in ' + (m === 'usb' ? 'USB' : m === 'wifi' ? 'Wi-Fi' : 'MTP') + ' mode'
    }
    function tick() { clearInterval(timer); if (auto && inView && !document.hidden) timer = setInterval(function () { show((cur + 1) % 3) }, dur) }
    tabs.forEach(function (t, i) { t.addEventListener('click', function () { auto = false; show(i); tick() }) })
    new IntersectionObserver(function (es) { inView = es[0].isIntersecting; tick() }, { threshold: 0.3 }).observe(root)
    document.addEventListener('visibilitychange', tick)
    show(0)
  })()
})()
