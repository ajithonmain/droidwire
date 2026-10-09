/* Interactive Droidwire demo: a working replica of the app UI with sample data. No network, no storage. */
'use strict'
;(function () {
  var demo = document.getElementById('demo')
  if (!demo) return
  var wrap = document.getElementById('demo-wrap')
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  var $ = function (id) { return document.getElementById(id) }
  var el = {
    name: $('d-name'), back: $('d-back'), fwd: $('d-fwd'), side: $('d-side'), files: $('d-files'), head: $('d-head'),
    prev: $('d-prev'), tr: $('d-tr'), crumb: $('d-crumb'), count: $('d-count'), xfer: $('d-xfer'), menu: $('d-menu'),
    modal: $('d-modal'), toast: $('d-toast'), off: $('d-off'), cursor: $('d-cursor'), search: $('d-q'), type: $('d-type'),
    sort: $('d-sort'), dir: $('d-dir'), vlist: $('d-vlist'), vgrid: $('d-vgrid'), conn: $('d-conn'), dev: $('d-dev'), theme: $('d-theme'),
    state: $('demo-state'), key: $('d-key'), cap: $('d-cap'), chips: $('demo-chips'), ghost: $('d-ghost'), content: $('d-content'), edit: $('d-edit'), editText: $('d-edit-text')
  }

  /* ---------- sample data ---------- */
  var CAM = ["PXL_20260905_091226706.jpg", "PXL_20260905_091307233.jpg", "PXL_20260905_091337718.jpg", "PXL_20260905_091414740.jpg", "PXL_20260905_091458167.jpg", "PXL_20260905_091543113.jpg", "PXL_20260905_091620365.jpg", "PXL_20260905_091702339.jpg", "PXL_20260905_091721834.jpg", "PXL_20260905_091758653.jpg", "PXL_20260905_091840587.jpg", "PXL_20260905_091912754.jpg", "PXL_20260905_091928337.jpg", "PXL_20260905_092015255.jpg", "PXL_20260906_092055499.jpg", "PXL_20260906_092149115.jpg", "PXL_20260906_092238895.jpg", "PXL_20260906_092249263.jpg", "PXL_20260906_092344705.jpg", "PXL_20260906_092353408.jpg", "PXL_20260906_092401943.jpg", "PXL_20260906_092425584.jpg", "PXL_20260906_092510836.jpg", "PXL_20260906_092541831.jpg", "PXL_20260906_092615504.jpg", "PXL_20260906_092708920.jpg", "PXL_20260906_092751555.jpg", "PXL_20260906_092806999.jpg", "PXL_20260907_092836199.jpg", "PXL_20260907_092845239.jpg", "PXL_20260907_092923322.jpg", "PXL_20260907_092946788.jpg", "PXL_20260907_093020897.jpg", "PXL_20260907_093107975.jpg", "PXL_20260907_093133531.jpg", "PXL_20260907_093212953.jpg", "PXL_20260907_093243687.jpg", "PXL_20260907_093312646.jpg", "PXL_20260907_093356517.jpg"]
  var D = '7 Oct 2026', ts = function (s) { return Date.parse(s) }
  function F(name, kind, size, o) { var f = { name: name, type: 'file', kind: kind, size: size, mod: D }; if (o) for (var k in o) f[k] = o[k]; return f }
  function Dir(name, kids, mod) { return { name: name, type: 'dir', kids: kids, mod: mod || D } }
  function seeded(i) { var x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x) }
  function camera(from, to, mod) {
    var out = []
    for (var i = from; i < to; i++) out.push(F(CAM[i], 'img', Math.round(180000 + seeded(i + 3) * 900000), { id: 'c' + (i < 10 ? '0' : '') + i, mod: mod || D }))
    return out
  }
  function shots(from, to) {
    var out = []
    for (var i = from; i < to; i++) out.push(F('Screenshot_2026091' + (i - from + 1) + '-1' + (i % 6) + '3' + (i % 9) + '02.png', 'img', Math.round(240000 + seeded(i) * 500000), { id: 'c' + i, mod: '14 Sept 2026' }))
    return out
  }
  var NOTES = 'Packing list\n- Passport\n- Charger\n- Camera\n- Sunglasses\n\nFri 12 Sept  Fly to Lisbon, 09:40\nSat 13 Sept  Alfama walk\nSun 14 Sept  Day trip to Sintra'
  var ROOT = Dir('Internal Storage', [
    Dir('DCIM', [Dir('Camera', camera(0, 12, '9 Jul 2026'), '9 Jul 2026')], '9 Jul 2026'),
    Dir('Documents', [F('Lease agreement.pdf', 'pdf', 312000, { mod: '2 Aug 2026' }), F('Invoice March.pdf', 'pdf', 96000, { mod: '18 Mar 2026' }), F('Resume.pdf', 'pdf', 184000, { mod: '26 Jun 2026' }), F('Ideas.txt', 'txt', 2100, { mod: '30 Sept 2026' })], '2 Aug 2026'),
    Dir('Download', [
      Dir('Weekend trip', [
        Dir('Camera', camera(0, CAM.length)),
        Dir('Edits', [F('IMG_2041.jpg', 'img', 442000, { id: 'i41' }), F('IMG_2042.jpg', 'img', 434000, { id: 'i42' })]),
        F('Backup 2026.zip', 'zip', 314572800),
        F('IMG_2043.jpg', 'img', 465000, { id: 'i43' }), F('IMG_2044.jpg', 'img', 767000, { id: 'i44' }), F('IMG_2045.jpg', 'img', 899000, { id: 'i45' }), F('IMG_2046.jpg', 'img', 754000, { id: 'i46' }),
        F('Notes.txt', 'txt', 56, { text: NOTES }),
        F('Project archive.zip', 'zip', 3000000),
        F('Trip itinerary.pdf', 'pdf', 16000),
        F('VID_0318.mp4', 'vid', 7200000, { id: 'v18' }), F('VID_0321.mp4', 'vid', 4700000, { id: 'v21' }),
        F('Voice memo.mp3', 'mp3', 3600000)
      ]),
      F('Boarding pass.pdf', 'pdf', 88000, { mod: '11 Sept 2026' }), F('invoice-0412.pdf', 'pdf', 120000, { mod: '12 Apr 2026' })
    ]),
    Dir('Movies', [F('VID_0318.mp4', 'vid', 7200000, { id: 'v18', mod: '18 Sept 2026' }), F('VID_0321.mp4', 'vid', 4700000, { id: 'v21', mod: '21 Sept 2026' })], '21 Sept 2026'),
    Dir('Music', [F('Voice memo.mp3', 'mp3', 3600000), F('Podcast ep 12.mp3', 'mp3', 41000000, { mod: '3 Sept 2026' }), F('Ringtone.mp3', 'mp3', 420000, { mod: '1 Jul 2026' })], '3 Sept 2026'),
    Dir('Pictures', [Dir('Screenshots', shots(20, 26), '14 Sept 2026')], '30 Sept 2026')
  ], '13 Sept 2026')
  var PIN = ['DCIM', 'Download', 'Documents', 'Music', 'Pictures', 'Movies']
  var KIND = { img: 'JPG', vid: 'MP4', pdf: 'PDF', txt: 'TXT', zip: 'ZIP', mp3: 'MP3' }
  var LABEL = { img: 'IMG', vid: 'MP4', pdf: 'PDF', txt: 'TXT', zip: 'ZIP', mp3: 'MP3' }

  /* ---------- state ---------- */
  var S = {
    path: [ROOT], back: [], fwd: [], view: 'list', sort: 'name', asc: true, type: 'all', q: '', sel: [], anchor: null,
    theme: 'light', clip: null, trs: [], connected: true, recent: [], pins: PIN.slice(), renaming: null, nextId: 1, scale: 1
  }
  function cur() { return S.path[S.path.length - 1] }
  function pathOf(n) { return '/storage/emulated/0/' + S.path.slice(1).map(function (p) { return p.name }).concat(n ? [n.name] : []).join('/') }
  function sizeOf(n) { return n.type === 'dir' ? n.kids.reduce(function (a, k) { return a + sizeOf(k) }, 0) : n.size }
  function fmt(b) {
    if (b < 1000) return Math.round(b) + ' B'
    var u = ['KB', 'MB', 'GB'], i = -1
    do { b /= 1000; i++ } while (b >= 1000 && i < 2)
    return (b >= 100 ? Math.round(b) : Math.round(b * 10) / 10) + ' ' + u[i]
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function kindOf(n) { return n.type === 'dir' ? 'Folder' : KIND[n.kind] || 'File' }
  function find(name) { return cur().kids.filter(function (k) { return k.name === name })[0] }
  function icon(n) {
    if (n.type === 'dir') return '<span class="fld"></span>'
    return '<span class="fi ' + n.kind + '" data-k="' + LABEL[n.kind] + '"></span>'
  }
  function tileIcon(n) {
    if (n.type === 'dir') return '<span class="fld"></span>'
    if (n.id) return '<span class="thw' + (n.kind === 'vid' ? ' v' : '') + '"><img class="thumb" alt="" src="demo/t/' + n.id + '.jpg"></span>'
    return icon(n)
  }

  /* ---------- derived list ---------- */
  function visible() {
    var q = S.q.trim().toLowerCase()
    var list = cur().kids.filter(function (k) {
      if (q && k.name.toLowerCase().indexOf(q) < 0) return false
      var t = S.type
      if (t === 'all') return true
      if (t === 'dir') return k.type === 'dir'
      if (t === 'doc') return k.type === 'file' && (k.kind === 'pdf' || k.kind === 'txt')
      return k.type === 'file' && k.kind === t
    })
    var dir = S.asc ? 1 : -1
    list.sort(function (a, b) {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      var r
      if (S.sort === 'size') r = sizeOf(a) - sizeOf(b)
      else if (S.sort === 'date') r = ts(a.mod) - ts(b.mod)
      else r = a.name.localeCompare(b.name, undefined, { numeric: true })
      return (r || a.name.localeCompare(b.name, undefined, { numeric: true })) * dir
    })
    return list
  }

  /* ---------- render ---------- */
  function render() {
    var c = cur(), list = visible()
    el.name.textContent = c.name
    el.back.disabled = !S.back.length; el.fwd.disabled = !S.fwd.length
    el.vlist.classList.toggle('on', S.view === 'list'); el.vgrid.classList.toggle('on', S.view === 'grid')
    el.sort.value = S.sort
    el.head.hidden = S.view !== 'list'
    ;[].forEach.call(el.head.children, function (h) { var on = h.getAttribute('data-s') === S.sort; h.classList.toggle('on', on); h.classList.toggle('desc', on && !S.asc) })
    var pins = S.pins.map(function (p) { return '<div class="d-si' + (c.name === p && S.path.length === 2 ? ' on' : '') + '" data-pin="' + esc(p) + '"><span class="fld"></span>' + esc(p) + '</div>' }).join('')
    var rec = S.recent.map(function (n, i) { return '<div class="d-si' + (i === 0 ? ' on' : '') + '" data-rec="' + i + '"><span class="fld"></span>' + esc(n.name) + '</div>' }).join('')
    el.side.innerHTML = '<div class="d-si' + (S.path.length === 1 ? ' on live' : '') + '" data-root="1"><span class="d-dev-ic"></span>Internal Storage</div><div class="d-sh">PINNED</div>' + pins + (rec ? '<div class="d-sh">RECENT</div>' + rec : '')
    if (!list.length) {
      el.files.className = 'd-files'
      el.files.innerHTML = '<div class="d-empty">' + (S.q || S.type !== 'all' ? 'No matching items' : 'This folder is empty') + '</div>'
    } else if (S.view === 'list') {
      el.files.className = 'd-files'
      el.files.innerHTML = list.map(function (n) {
        var sel = S.sel.indexOf(n.name) >= 0, ren = S.renaming === n.name
        return '<div class="d-row' + (sel ? ' sel' : '') + '" data-n="' + esc(n.name) + '"><span class="n">' + icon(n) + (ren ? '<input value="' + esc(n.name) + '" data-ren="1">' : '<span class="t">' + esc(n.name) + '</span>') + '</span><span class="s">' + fmt(sizeOf(n)) + '</span><span class="m">' + n.mod + '</span><span class="k">' + kindOf(n) + '</span></div>'
      }).join('')
    } else {
      el.files.className = 'd-files d-grid'
      el.files.innerHTML = list.map(function (n) {
        var sel = S.sel.indexOf(n.name) >= 0, ren = S.renaming === n.name
        return '<div class="d-tile' + (sel ? ' sel' : '') + '" data-n="' + esc(n.name) + '"><span class="ic">' + tileIcon(n) + '</span><span class="nm">' + (ren ? '<input value="' + esc(n.name) + '" data-ren="1">' : esc(n.name)) + '</span></div>'
      }).join('')
    }
    var ri = el.files.querySelector('input[data-ren]')
    if (ri) { ri.focus(); ri.select() }
    el.crumb.innerHTML = ['Device'].concat(S.path.map(function (p) { return p.name })).map(function (n, i, a) {
      return (i === a.length - 1 ? '<b>' + esc(n) + '</b>' : '<a data-ci="' + (i - 1) + '">' + esc(n) + '</a><s>&rsaquo;</s>')
    }).join('')
    var selN = S.sel.map(find).filter(Boolean)
    el.count.textContent = selN.length ? selN.length + ' selected - ' + fmt(selN.reduce(function (a, n) { return a + sizeOf(n) }, 0)) : list.length + ' items'
    renderPreview(selN)
    renderTransfers(true)
  }

  function renderPreview(sel) {
    if (!sel.length) { el.prev.classList.remove('open'); return }
    el.prev.classList.add('open')
    var n = sel[0], pv = '', info = ''
    if (sel.length > 1) {
      pv = '<div class="d-pv">' + sel.length + ' items selected</div>'
      info = '<h4>' + sel.length + ' items</h4><div class="d-kv">Total size<b>' + fmt(sel.reduce(function (a, x) { return a + sizeOf(x) }, 0)) + '</b></div>'
    } else {
      if (n.type === 'dir') pv = '<div class="d-pv"><span class="fld"></span></div>'
      else if (n.kind === 'img') pv = '<div class="d-pv"><img alt="" src="demo/p/' + n.id + '.jpg"></div>'
      else if (n.kind === 'vid') pv = '<div class="d-pv v"><img alt="" src="demo/p/' + n.id + '.jpg"></div>'
      else if (n.kind === 'txt' && n.text) pv = '<div class="d-pv"><div class="txt">' + esc(n.text) + '</div></div>'
      else if (n.kind === 'pdf') pv = '<div class="d-pv"><div class="doc"><b>' + esc(n.name.replace(/\.pdf$/, '')) + '</b><i></i><i></i><i></i><i></i><i></i><i></i></div></div>'
      else if (n.kind === 'mp3') pv = '<div class="d-pv"><div class="bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>'
      else pv = '<div class="d-pv">' + (n.size > 100000000 ? 'Too large to preview' : 'No preview available') + '</div>'
      var kind = n.type === 'dir' ? 'FOLDER' : (n.kind === 'img' ? 'JPEG' : KIND[n.kind])
      info = '<h4>' + esc(n.name) + '</h4><span class="d-badge' + (n.kind === 'img' ? ' g' : '') + '">' + kind + '</span>' +
        '<div class="d-kv">Size<b>' + fmt(sizeOf(n)) + '</b></div><div class="d-kv">Modified<b>' + n.mod + '</b></div>' +
        '<div class="d-kv">Permissions<b>' + (n.type === 'dir' ? '0770' : '0660') + '</b></div>' +
        '<div class="d-path">Path<code>' + esc(pathOf(n)) + '</code></div>'
    }
    el.prev.innerHTML = '<div class="d-ph">PREVIEW<button data-act="closeprev" aria-label="Close preview">&times;</button></div>' + pv + '<div class="d-pi">' + info + '</div><button class="d-dl" data-act="download"><svg viewBox="0 0 16 16"><path d="M8 2v9M4 7.5 8 11.5 12 7.5M3 14h10"/></svg>Download</button>'
  }

  /* ---------- navigation ---------- */
  function go(path, noHist) {
    if (!noHist) { S.back.push(S.path); S.fwd = [] }
    S.path = path; S.sel = []; S.q = ''; el.search.value = ''; S.renaming = null
    var c = cur()
    if (S.path.length > 1) S.recent = [c].concat(S.recent.filter(function (r) { return r !== c })).slice(0, 3)
    render()
  }
  function open(n) {
    if (n.type === 'dir') go(S.path.concat([n]))
    else if (n.kind === 'txt') openEditor(n)
    else toast('Opens in its Mac app. Save it and the change goes back to the phone.')
  }
  var editing = null
  function openEditor(n) {
    editing = n; el.editText.value = n.text || n.name + '\n'
    document.getElementById('d-edit-title').textContent = n.name; el.edit.classList.add('open')
    setTimeout(function () { if (!tour.running) el.editText.focus() }, 50)
  }
  function closeEditor() { el.edit.classList.remove('open'); editing = null }
  function saveEditor() {
    if (!editing) return
    editing.text = el.editText.value; editing.size = editing.text.length; editing.mod = 'Just now'
    var nm = editing.name; closeEditor(); toast('Saved. Pushed back to the phone.')
    S.sel = [nm]; render()
  }
  document.getElementById('d-edit-save').addEventListener('click', saveEditor)
  document.getElementById('d-edit-close').addEventListener('click', closeEditor)
  el.editText.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveEditor() }
    if (e.key === 'Escape') closeEditor()
    e.stopPropagation()
  })
  function pinPath(name) { var n = ROOT.kids.filter(function (k) { return k.name === name })[0]; if (n) go([ROOT, n]) }
  function chainTo(root, target) {
    if (root === target) return [root]
    if (!root.kids) return null
    for (var i = 0; i < root.kids.length; i++) { var c = chainTo(root.kids[i], target); if (c) return [root].concat(c) }
    return null
  }

  /* ---------- selection ---------- */
  function select(name, e) {
    var names = visible().map(function (n) { return n.name })
    if (e && (e.metaKey || e.ctrlKey)) {
      var i = S.sel.indexOf(name); if (i >= 0) S.sel.splice(i, 1); else S.sel.push(name); S.anchor = name
    } else if (e && e.shiftKey && S.anchor) {
      var a = names.indexOf(S.anchor), b = names.indexOf(name)
      S.sel = names.slice(Math.min(a, b), Math.max(a, b) + 1)
    } else { S.sel = [name]; S.anchor = name }
    render()
  }

  /* ---------- toast / modal / menu ---------- */
  var toastT
  function toast(msg) { el.toast.textContent = msg; el.toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { el.toast.classList.remove('show') }, 2600) }
  function modal(html, onclick) {
    el.modal.innerHTML = html; el.modal.classList.add('open')
    el.modal.onclick = function (e) {
      if (e.target === el.modal) { closeModal(); return }
      var b = e.target.closest('button'); if (b && onclick) onclick(b.getAttribute('data-b'))
    }
  }
  function closeModal() { el.modal.classList.remove('open'); el.modal.innerHTML = '' }
  function menuItems(target) {
    if (!target) return [['New Folder', 'newfolder']].concat(S.clip ? [['Paste', 'paste', '⌘V']] : [])
    var many = S.sel.length > 1
    var it = [[target.type === 'dir' ? 'Open' : 'Open & Edit', 'open'], ['Download', 'download'], '-', ['Copy', 'copy', '⌘C'], ['Cut', 'cut', '⌘X']]
    if (S.clip) it.push(['Paste', 'paste', '⌘V'])
    if (!many) it.push(['Rename', 'rename'])
    it.push(['Copy Path', 'copypath'], '-', ['New Folder', 'newfolder'], '-', ['Delete', 'delete'])
    return it
  }
  function showMenu(x, y, target) {
    el.menu.innerHTML = menuItems(target).map(function (i) {
      if (i === '-') return '<hr>'
      return '<a data-act="' + i[1] + '" class="' + (i[1] === 'delete' ? 'dng' : '') + '">' + i[0] + (i[2] ? '<span>' + i[2] + '</span>' : '') + '</a>'
    }).join('')
    el.menu.classList.add('open')
    var w = el.menu.offsetWidth, h = el.menu.offsetHeight
    el.menu.style.left = Math.max(4, Math.min(x, 1000 - w - 8)) + 'px'; el.menu.style.top = Math.max(4, Math.min(y, 640 - h - 8)) + 'px'
  }
  function hideMenu() { el.menu.classList.remove('open') }

  /* ---------- actions ---------- */
  function selNodes() { return S.sel.map(find).filter(Boolean) }
  function uniqueName(name) {
    var kids = cur().kids.map(function (k) { return k.name }); if (kids.indexOf(name) < 0) return name
    var m = name.match(/^(.*?)(\.[^.]+)?$/), i = 2; while (kids.indexOf(m[1] + ' ' + i + (m[2] || '')) >= 0) i++
    return m[1] + ' ' + i + (m[2] || '')
  }
  function removeFromTree(root, n) {
    if (!root.kids) return false
    var i = root.kids.indexOf(n); if (i >= 0) { root.kids.splice(i, 1); return true }
    return root.kids.some(function (k) { return removeFromTree(k, n) })
  }
  function act(a) {
    hideMenu()
    var nodes = selNodes()
    if (a === 'closeprev') { S.sel = []; render() }
    else if (a === 'open' && nodes[0]) open(nodes[0])
    else if (a === 'download') nodes.forEach(function (n) { startTransfer(n) })
    else if (a === 'copy' && nodes.length) { S.clip = { nodes: nodes, cut: false }; toast(nodes.length + (nodes.length > 1 ? ' items copied' : ' item copied')) }
    else if (a === 'cut' && nodes.length) { S.clip = { nodes: nodes, cut: true }; toast('Cut. Paste in another folder to move.') }
    else if (a === 'paste' && S.clip) {
      var added = []
      S.clip.nodes.forEach(function (n) {
        var copy = JSON.parse(JSON.stringify(n)); copy.name = uniqueName(n.name); cur().kids.push(copy); added.push(copy.name)
        if (S.clip.cut) removeFromTree(ROOT, n)
      })
      if (S.clip.cut) S.clip = null
      S.sel = added; render()
    }
    else if (a === 'rename' && nodes[0]) { S.renaming = nodes[0].name; render() }
    else if (a === 'copypath' && nodes[0]) toast('Path copied: ' + pathOf(nodes[0]))
    else if (a === 'newfolder') { var nm = uniqueName('untitled folder'); cur().kids.push(Dir(nm, [])); S.sel = [nm]; S.renaming = nm; render() }
    else if (a === 'delete' && nodes.length) confirmDelete(nodes)
  }
  function confirmDelete(nodes) {
    var label = nodes.length === 1 ? '“' + esc(nodes[0].name) + '”' : nodes.length + ' items'
    modal('<div class="d-card"><h3>Delete ' + label + '?</h3><p>Droidwire always asks before deleting. In this demo nothing real is touched, and reloading the page restores everything.</p><div class="bs"><button data-b="cancel">Cancel</button><button class="dg" data-b="ok">Delete</button></div></div>', function (b) {
      if (b === 'ok') { nodes.forEach(function (n) { var i = cur().kids.indexOf(n); if (i >= 0) cur().kids.splice(i, 1) }); S.sel = []; closeModal(); render() }
      else closeModal()
    })
  }
  function commitRename(input) {
    var old = S.renaming, v = input.value.trim(); S.renaming = null
    var n = find(old)
    if (n && v && v !== old && !cur().kids.some(function (k) { return k.name === v })) { n.name = v; S.sel = [v] }
    render()
  }

  /* ---------- transfers ---------- */
  function startTransfer(n, dir) {
    var isDir = n.type === 'dir', size = sizeOf(n) || 1
    S.trs.push({ id: S.nextId++, name: n.name + (isDir ? '.zip' : ''), size: size, p: 0, state: 'run', speed: 38, up: dir === 'up', dur: Math.max(1600, size / 38e6 * 1000) })
    if (S.trs.length > 4) S.trs.shift()
    renderTransfers(true); tickStart()
  }
  var tickT, last
  function tickStart() { if (tickT) return; last = performance.now(); tickT = setInterval(tick, 100) }
  function tick() {
    var now = performance.now(), dt = now - last, any = false; last = now
    S.trs.forEach(function (t) {
      if (t.state !== 'run') return
      any = true
      t.p = Math.min(1, t.p + dt / t.dur)
      t.speed = Math.max(24, Math.min(46, t.speed + (Math.random() - .5) * 5))
      if (t.p >= 1) { t.state = 'done'; t.doneAt = now }
    })
    var before = S.trs.length
    S.trs = S.trs.filter(function (t) { return !(t.state === 'done' && now - t.doneAt > 9000) })
    renderTransfers(S.trs.length !== before)
    if (!any && !S.trs.length) { clearInterval(tickT); tickT = null }
  }
  function renderTransfers(rebuild) {
    var active = S.trs.filter(function (t) { return t.state === 'run' || t.state === 'pause' }).length
    el.tr.classList.toggle('open', S.trs.length > 0)
    el.xfer.textContent = active ? active + ' transferring' : ''
    if (rebuild) {
      el.tr.innerHTML = S.trs.length ? '<div class="d-trh"></div>' + S.trs.map(function (t) {
        return '<div class="d-trr" data-t="' + t.id + '"><div class="a"><span>' + esc(t.name) + '</span><em></em></div><div class="d-bar2"><i></i></div><div class="b"><span></span><span class="l"></span></div><button class="x" data-x="' + t.id + '" aria-label="Dismiss">&times;</button></div>'
      }).join('') : ''
    }
    var h = el.tr.querySelector('.d-trh'); if (h) h.textContent = 'TRANSFERS · ' + active + ' ACTIVE'
    S.trs.forEach(function (t) {
      var r = el.tr.querySelector('[data-t="' + t.id + '"]'); if (!r) return
      var left = (1 - t.p) * t.dur / 1000
      r.classList.toggle('done', t.state === 'done')
      r.querySelector('.a em').textContent = t.state === 'done' ? 'Done' : t.state === 'pause' ? 'Paused' : Math.floor(t.p * 100) + '%'
      r.querySelector('.d-bar2 i').style.width = (t.p * 100).toFixed(1) + '%'
      r.querySelector('.b > span').textContent = t.state === 'done' ? (t.up ? 'Sent to the phone' : 'Saved to ~/Downloads/Droidwire') : t.state === 'pause' ? fmt(t.size * t.p) + ' of ' + fmt(t.size) : t.speed.toFixed(0) + ' MB/s · ' + Math.max(1, Math.ceil(left)) + 's'
      var l = r.querySelector('.l')
      var html = t.state === 'done' ? (t.up ? '' : '<a data-tact="finder" data-id="' + t.id + '">Show in Finder</a>') : '<a data-tact="pause" data-id="' + t.id + '">' + (t.state === 'pause' ? 'Resume' : 'Pause') + '</a><a class="c" data-tact="cancel" data-id="' + t.id + '">Cancel</a>'
      if (l.getAttribute('data-h') !== html) { l.innerHTML = html; l.setAttribute('data-h', html) }
    })
  }
  function transferAct(kind, id) {
    var t = S.trs.filter(function (x) { return x.id === +id })[0]; if (!t) return
    if (kind === 'pause') { t.state = t.state === 'pause' ? 'run' : 'pause'; if (t.state === 'run') { last = performance.now(); tickStart() } }
    else if (kind === 'cancel') S.trs = S.trs.filter(function (x) { return x !== t })
    else if (kind === 'finder') toast('Revealed in Finder: ~/Downloads/Droidwire/' + t.name)
    renderTransfers(true)
  }

  /* ---------- device tools ---------- */
  function tools(tab) {
    var body
    if (tab === 'apps') body = [['Chrome', '412 MB'], ['Google Maps', '268 MB'], ['Photos', '356 MB'], ['Spotify', '198 MB'], ['WhatsApp', '521 MB']].map(function (r) { return '<div class="d-kv">' + r[0] + '<b>' + r[1] + ' · Export APK</b></div>' }).join('')
    else if (tab === 'storage') body = '<div class="d-seg2"><i></i><i></i><i></i><i></i><i></i></div><div class="d-kv">Images<b>22 GB</b></div><div class="d-kv">Video<b>14 GB</b></div><div class="d-kv">Apps<b>12 GB</b></div><div class="d-kv">Other<b>10 GB</b></div><div class="d-kv">Free<b>45 GB of 110 GB</b></div>'
    else body = [['Model', 'Google Pixel 4a'], ['Android', '13 (API 33)'], ['Battery', '88%, charging'], ['Health', 'Good'], ['Temperature', '37.2 °C'], ['Connection', 'USB (ADB)']].map(function (r) { return '<div class="d-kv">' + r[0] + '<b>' + r[1] + '</b></div>' }).join('')
    modal('<div class="d-card wide"><div class="d-tabs2"><button data-b="info" class="' + (tab === 'info' ? 'on' : '') + '">Device Info</button><button data-b="apps" class="' + (tab === 'apps' ? 'on' : '') + '">Apps</button><button data-b="storage" class="' + (tab === 'storage' ? 'on' : '') + '">Storage</button><span class="d-grow"></span><button data-b="close">&times;</button></div><div class="d-info">' + body + '</div></div>', function (b) { if (b === 'close') closeModal(); else tools(b) })
  }

  /* ---------- connection + theme ---------- */
  var ICON = {
    moon: '<svg viewBox="0 0 16 16"><path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z"/></svg>',
    sun: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/></svg>'
  }
  function setConnected(on) {
    S.connected = on; el.off.classList.toggle('open', !on)
    el.conn.classList.toggle('off', !on); el.conn.lastChild.textContent = on ? 'Connected' : 'Not connected'
    el.dev.hidden = !on; $('d-eject').textContent = on ? 'Eject' : 'Connect'
  }
  function setTheme(t) { S.theme = t; demo.setAttribute('data-theme', t); el.theme.innerHTML = t === 'light' ? ICON.moon : ICON.sun }
  el.theme.innerHTML = ICON.moon

  /* ---------- events ---------- */
  var tour = { token: 0, running: false, user: false }

  el.files.addEventListener('click', function (e) {
    if (e.target.closest('input')) return
    var r = e.target.closest('[data-n]')
    if (r) select(r.getAttribute('data-n'), e); else { S.sel = []; render() }
  })
  el.files.addEventListener('dblclick', function (e) { var r = e.target.closest('[data-n]'); if (r) { var n = find(r.getAttribute('data-n')); if (n) open(n) } })
  el.files.addEventListener('contextmenu', function (e) {
    e.preventDefault()
    var r = e.target.closest('[data-n]'), rect = demo.getBoundingClientRect(), sc = S.scale
    var x = (e.clientX - rect.left) / sc, y = (e.clientY - rect.top) / sc
    if (r) { var nm = r.getAttribute('data-n'); if (S.sel.indexOf(nm) < 0) { S.sel = [nm]; render() } showMenu(x, y, find(nm)) }
    else { S.sel = []; render(); showMenu(x, y, null) }
  })
  el.files.addEventListener('keydown', function (e) {
    if (!e.target.matches('input[data-ren]')) return
    if (e.key === 'Enter') commitRename(e.target)
    if (e.key === 'Escape') { S.renaming = null; render() }
    e.stopPropagation()
  })
  el.files.addEventListener('focusout', function (e) { if (S.renaming && e.target.matches && e.target.matches('input[data-ren]')) commitRename(e.target) })
  el.menu.addEventListener('click', function (e) { var a = e.target.closest('[data-act]'); if (a) act(a.getAttribute('data-act')) })
  el.prev.addEventListener('click', function (e) { var a = e.target.closest('[data-act]'); if (a) act(a.getAttribute('data-act')) })
  el.tr.addEventListener('click', function (e) {
    var a = e.target.closest('[data-tact]'); if (a) { transferAct(a.getAttribute('data-tact'), a.getAttribute('data-id')); return }
    var x = e.target.closest('[data-x]'); if (x) { S.trs = S.trs.filter(function (t) { return t.id !== +x.getAttribute('data-x') }); renderTransfers(true) }
  })
  el.side.addEventListener('click', function (e) {
    var p = e.target.closest('[data-pin]'), r = e.target.closest('[data-rec]'), root = e.target.closest('[data-root]')
    if (p) pinPath(p.getAttribute('data-pin'))
    else if (r) { var chain = chainTo(ROOT, S.recent[+r.getAttribute('data-rec')]); if (chain) go(chain) }
    else if (root) go([ROOT])
  })
  el.crumb.addEventListener('click', function (e) { var a = e.target.closest('[data-ci]'); if (a) { var i = +a.getAttribute('data-ci'); go(i < 0 ? [ROOT] : S.path.slice(0, i + 1)) } })
  el.back.addEventListener('click', function () { if (S.back.length) { S.fwd.push(S.path); go(S.back.pop(), true) } })
  el.fwd.addEventListener('click', function () { if (S.fwd.length) { S.back.push(S.path); go(S.fwd.pop(), true) } })
  el.vlist.addEventListener('click', function () { S.view = 'list'; render() })
  el.vgrid.addEventListener('click', function () { S.view = 'grid'; render() })
  el.type.addEventListener('change', function () { S.type = el.type.value; render() })
  el.sort.addEventListener('change', function () { S.sort = el.sort.value; render() })
  el.dir.addEventListener('click', function () { S.asc = !S.asc; render() })
  el.head.addEventListener('click', function (e) { var h = e.target.closest('[data-s]'); if (!h) return; var s = h.getAttribute('data-s'); if (S.sort === s) S.asc = !S.asc; else { S.sort = s; S.asc = true } render() })
  el.search.addEventListener('input', function () { S.q = el.search.value; render() })
  $('d-newfolder').addEventListener('click', function () { act('newfolder') })
  $('d-tools').addEventListener('click', function () { tools('info') })
  $('d-tabs').addEventListener('click', function () { toast('Tabs keep several phone locations open side by side') })
  $('d-mark').addEventListener('click', function () {
    var c = cur(); if (S.path.length !== 2) { toast('Open a top-level folder to bookmark it'); return }
    var i = S.pins.indexOf(c.name); if (i >= 0) { S.pins.splice(i, 1); toast('Bookmark removed') } else { S.pins.push(c.name); toast('Bookmarked ' + c.name) }
    render()
  })
  el.theme.addEventListener('click', function () { setTheme(S.theme === 'light' ? 'dark' : 'light') })
  $('d-eject').addEventListener('click', function () { setConnected(!S.connected) })
  $('d-reconnect').addEventListener('click', function () { setConnected(true) })
  $('d-add').addEventListener('click', function () { toast('Add a second phone over USB or Wi-Fi from here') })
  demo.addEventListener('pointerdown', function (e) { if (!e.target.closest('.d-menu')) hideMenu() })
  demo.addEventListener('keydown', function (e) {
    if (e.target.matches('input')) return
    var meta = e.metaKey || e.ctrlKey
    if (e.key === 'Escape') { hideMenu(); closeModal(); S.sel = []; render() }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel.length) { e.preventDefault(); act('delete') }
    else if (e.key === 'Enter' && S.sel.length === 1) { var n = find(S.sel[0]); if (n) open(n) }
    else if (meta && e.key === 'a') { e.preventDefault(); S.sel = visible().map(function (n) { return n.name }); render() }
    else if (meta && e.key === 'c') act('copy')
    else if (meta && e.key === 'x') act('cut')
    else if (meta && e.key === 'v') act('paste')
    else if (meta && e.key === '[') { e.preventDefault(); el.back.click() }
    else if (meta && e.key === ']') { e.preventDefault(); el.fwd.click() }
    else if (meta && e.key === 'f') { e.preventDefault(); el.search.focus() }
  })

  /* ---------- fit to container ---------- */
  function fit() { S.scale = wrap.clientWidth / 1000; demo.style.transform = 'scale(' + S.scale + ')' }
  new ResizeObserver(fit).observe(wrap); fit()

  /* ---------- scripted loop (a screen recording that never ends) ---------- */
  var STOP = 'stop'
  function chk(my) { if (my !== tour.token) throw STOP }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  function pos(target, dx, dy) {
    var d = demo.getBoundingClientRect(), r = target.getBoundingClientRect(), sc = S.scale
    return [(r.left - d.left) / sc + (dx == null ? r.width / sc / 2 : dx), (r.top - d.top) / sc + (dy == null ? r.height / sc / 2 : dy)]
  }
  function tap() { el.cursor.classList.remove('tap'); void el.cursor.offsetWidth; el.cursor.classList.add('tap') }
  function fire(target, type, extra) {
    if (!target) return
    var r = target.getBoundingClientRect()
    target.dispatchEvent(new MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: type === 'contextmenu' ? 2 : 0 }, extra || {})))
  }
  function rowEl(name) { return el.files.querySelector('[data-n="' + name.replace(/"/g, '\\"') + '"]') }
  var keyT
  function showKey(t) { el.key.textContent = t; el.key.classList.add('show'); clearTimeout(keyT); keyT = setTimeout(function () { el.key.classList.remove('show') }, 1300) }
  function caption(i) {
    el.cap.innerHTML = '<b>' + (i < 9 ? '0' : '') + (i + 1) + '</b>' + CH[i].t
    el.cap.classList.add('show')
    ;[].forEach.call(el.chips.children, function (c, k) { c.classList.toggle('on', k === i) })
  }
  function child(n, name) { return n.kids.filter(function (k) { return k.name === name })[0] }
  function nodes() { var dl = child(ROOT, 'Download'), wt = child(dl, 'Weekend trip'); return { dl: dl, wt: wt, cam: child(wt, 'Camera') } }

  function prep(i) {
    closeModal(); hideMenu(); closeEditor(); S.q = ''; el.search.value = ''; S.type = 'all'; el.type.value = 'all'; S.sort = 'name'; S.asc = true; S.sel = []; S.renaming = null
    setTheme('light'); setConnected(i >= 1)
    var N = nodes()
    if (i <= 1) { S.view = 'list'; go([ROOT], true) }
    else if (i <= 3) { S.view = 'grid'; go([ROOT, N.dl, N.wt, N.cam], true) }
    else { S.view = 'list'; go([ROOT, N.dl, N.wt], true) }
    S.back = []; S.fwd = []; el.back.disabled = true; el.fwd.disabled = true
    if (i === 0) { S.trs = []; S.recent = []; render() }
    el.cursor.style.transition = 'none'; el.cursor.style.transform = 'translate(620px,560px)'; void el.cursor.offsetWidth; el.cursor.style.transition = ''
    el.cursor.classList.remove('on')
  }

  var CH = [
    { t: 'Plug in. It connects.', run: async function (w, m) {
      await w(1500); toast('Pixel 4a found over USB'); await w(900); setConnected(true); await w(1400)
    } },
    { t: 'Browse like Finder', run: async function (w, m) {
      var N = nodes()
      await m(el.side.querySelector('[data-pin="Download"]')); el.side.querySelector('[data-pin="Download"]').click(); await w(800)
      await m(rowEl('Weekend trip'), 120, 15); fire(rowEl('Weekend trip'), 'click'); await w(300); tap(); fire(rowEl('Weekend trip'), 'dblclick'); await w(900)
      await m(rowEl('Camera'), 100, 15); fire(rowEl('Camera'), 'dblclick'); await w(700)
      await m(el.vgrid); el.vgrid.click(); await w(1400)
      await m(rowEl(CAM[14]), 40, 30, 700); el.files.scrollTo({ top: 360, behavior: 'smooth' }); await w(1600); el.files.scrollTo({ top: 0, behavior: 'smooth' }); await w(1200)
    } },
    { t: 'Search the whole folder', run: async function (w, m, T) {
      await m(el.search.parentNode, 40, 14); el.search.focus(); await w(400)
      await T(el.search, '0906', 190); await w(1800)
      el.search.value = ''; S.q = ''; render(); el.search.blur(); await w(900)
    } },
    { t: 'Preview before you pull', run: async function (w, m) {
      await m(rowEl(CAM[3]), 40, 30); fire(rowEl(CAM[3]), 'click'); await w(1500)
      await m(rowEl(CAM[16]), 40, 30); fire(rowEl(CAM[16]), 'click'); await w(1500)
      var bc = el.crumb.querySelector('[data-ci="2"]'); await m(bc); bc.click(); await w(700)
      await m(el.vlist); el.vlist.click(); await w(600)
      await m(rowEl('Trip itinerary.pdf'), 90, 15); fire(rowEl('Trip itinerary.pdf'), 'click'); await w(1500)
      await m(rowEl('VID_0318.mp4'), 90, 15); fire(rowEl('VID_0318.mp4'), 'click'); await w(1600)
    } },
    { t: 'Download with live speed', run: async function (w, m) {
      await m(rowEl('IMG_2043.jpg'), 90, 15); fire(rowEl('IMG_2043.jpg'), 'click'); await w(400)
      await m(rowEl('IMG_2044.jpg'), 90, 15, 700); fire(rowEl('IMG_2044.jpg'), 'click', { metaKey: true }); showKey('⌘ click'); await w(400)
      await m(rowEl('Project archive.zip'), 90, 15, 700); fire(rowEl('Project archive.zip'), 'click', { metaKey: true }); await w(600)
      await m(rowEl('Project archive.zip'), 90, 15, 600); fire(rowEl('Project archive.zip'), 'contextmenu'); await w(1000)
      var d = el.menu.querySelector('[data-act="download"]'); await m(d, 700); d.click(); await w(4200)
    } },
    { t: 'Open, edit, save. It syncs back.', run: async function (w, m, T) {
      S.sel = []; render(); await w(300)
      await m(rowEl('Notes.txt'), 90, 15); fire(rowEl('Notes.txt'), 'click'); await w(500)
      fire(rowEl('Notes.txt'), 'contextmenu'); await w(900)
      var o = el.menu.querySelector('[data-act="open"]'); await m(o, 700); o.click(); await w(900)
      await m(el.editText, 120, 120); await T(el.editText, '\n- Power bank', 90, true); await w(700)
      showKey('⌘ S'); await w(500); saveEditor(); await w(1800)
    } },
    { t: 'Drag in files from Finder', run: async function (w, m) {
      el.cursor.style.transition = 'none'; el.cursor.style.transform = 'translate(900px,560px)'; void el.cursor.offsetWidth; el.cursor.style.transition = ''
      el.cursor.classList.add('on'); el.ghost.textContent = '2 files from Finder'; el.ghost.classList.add('on'); await w(700)
      await m(el.files, 420, 250, 1300); el.content.classList.add('drop'); await w(900)
      el.ghost.classList.remove('on'); el.content.classList.remove('drop'); tap()
      var wt = nodes().wt
      ;[['Lisbon rooftops.jpg', 'i44', 612000], ['Tram 28.jpg', 'i45', 534000]].forEach(function (f) { var n = F(f[0], 'img', f[2], { id: f[1], mod: 'Today' }); wt.kids.push(n); S.sel.push(n.name) })
      render(); S.sel.slice().forEach(function (n) { startTransfer(find(n), 'up') }); await w(4200)
    } },
    { t: 'Device tools built in', run: async function (w, m) {
      S.sel = []; render()
      await m($('d-tools')); $('d-tools').click(); await w(1700)
      var b = el.modal.querySelector('[data-b="storage"]'); await m(b, 700); b.click(); await w(1900)
      var c = el.modal.querySelector('[data-b="close"]'); await m(c, 700); c.click(); await w(600)
    } },
    { t: 'Light, dark, your call', run: async function (w, m) {
      await m(el.theme); el.theme.click(); await w(1400)
      await m(el.head.querySelector('[data-s="size"]'), 800); el.head.querySelector('[data-s="size"]').click(); await w(1300)
      el.head.querySelector('[data-s="size"]').click(); await w(1100)
      await m(el.theme, 800); el.theme.click(); await w(1200)
    } }
  ]
  el.chips.innerHTML = CH.map(function (c, i) { return '<button type="button" data-ch="' + i + '">' + c.t + '</button>' }).join('')

  function restore() {
    var snap = JSON.parse(SNAP); ROOT.kids = snap.kids
    S.clip = null; S.pins = PIN.slice()
  }
  async function runLoop(from) {
    var my = ++tour.token; tour.running = true; tour.user = false
    function live() { chk(my) }
    var w = async function (ms) { await sleep(ms); live() }
    var m = async function (target, a, b, c) {
      var ms = arguments.length === 2 ? a : c, dx = arguments.length === 2 ? null : a, dy = arguments.length === 2 ? null : b
      live(); var p = pos(target, dx, dy)
      el.cursor.classList.add('on'); el.cursor.style.transform = 'translate(' + Math.round(p[0]) + 'px,' + Math.round(p[1]) + 'px)'
      await w(ms || 950); tap()
    }
    var T = async function (input, text, per, noevent) {
      for (var i = 0; i < text.length; i++) {
        input.value = input.value + text[i]
        if (input === el.search) { S.q = input.value; render() }
        await w(per)
      }
    }
    el.state.textContent = 'A self-playing tour. Click anywhere to take over, or pick a chapter.'
    try {
      var i = from || 0
      restore()
      while (true) {
        prep(i); caption(i); await w(i === 0 ? 700 : 500)
        await CH[i].run(w, m, T)
        el.cursor.classList.remove('on'); await w(500)
        i++
        if (i >= CH.length) { el.cap.classList.remove('show'); await w(1200); i = 0; restore() }
      }
    } catch (e) { if (e !== STOP) throw e }
  }
  function takeOver() {
    if (!tour.running) return
    tour.token++; tour.running = false; tour.user = true
    el.cursor.classList.remove('on'); el.cap.classList.remove('show'); el.ghost.classList.remove('on'); el.content.classList.remove('drop')
    if (!S.connected) setConnected(true)
    el.state.textContent = 'Your turn. Everything here works. Pick a chapter or replay to watch again.'
  }
  demo.addEventListener('pointerdown', function (e) { if (e.isTrusted) takeOver() }, true)
  demo.addEventListener('keydown', function (e) { if (e.isTrusted) takeOver() }, true)
  $('demo-tour').addEventListener('click', function () { tour.user = false; runLoop(0) })
  el.chips.addEventListener('click', function (e) { var b = e.target.closest('[data-ch]'); if (b) { tour.user = false; runLoop(+b.getAttribute('data-ch')) } })

  /* ---------- start ---------- */
  var SNAP = JSON.stringify(ROOT)
  prep(1); render()
  if (reduce) { var N0 = nodes(); go([ROOT, N0.dl, N0.wt], true); S.sel = ['IMG_2043.jpg']; render(); el.state.textContent = 'Click around, it all works.' }
  else {
    var inView = false, started = false
    new IntersectionObserver(function (es) {
      inView = es[0].isIntersecting
      if (inView && !tour.running && !tour.user) { started = true; runLoop(0) }
      else if (!inView && tour.running) { tour.token++; tour.running = false }
    }, { threshold: 0.4 }).observe(wrap)
  }
})()
