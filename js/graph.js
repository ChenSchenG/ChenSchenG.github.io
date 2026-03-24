/**
 * graph.js — D3 knowledge graph + category chips + article list
 */
(function () {
  'use strict';

  var COLORS = {
    Security: '#e74c3c', Network: '#27ae60',
    Frontend: '#2980b9', AI: '#8e44ad', Other: '#7f8c8d'
  };

  var isSubdir = location.pathname.indexOf('/knowledge/') !== -1;
  var dataPath = isSubdir ? '../data/graph-data.json' : 'data/graph-data.json';
  var prefix = isSubdir ? '' : 'knowledge/';

  fetch(dataPath).then(function (r) { return r.json(); }).then(function (data) {
    renderPostList(data);
    renderGraph(data);
    renderCategoryChips(data);
  }).catch(function () {
    var c = document.getElementById('graph-container');
    if (c) c.innerHTML = '<p style="text-align:center;padding:40px;color:#999">Run <code>node build.js</code> to generate.</p>';
  });

  /* ==================== Post List (all articles, simple rows) ==================== */
  function renderPostList(data) {
    var el = document.getElementById('post-list');
    if (!el) return;
    var sorted = data.nodes.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    sorted.forEach(function (n) {
      var a = document.createElement('a');
      a.className = 'article-list-item';
      a.href = prefix + n.slug + '.html';
      a.innerHTML = '<span class="article-title">' + n.title + '</span><span class="article-date">' + (n.date || '') + '</span>';
      el.appendChild(a);
    });
  }

  /* ==================== Category chips ==================== */
  function renderCategoryChips(data) {
    var grid = document.getElementById('category-grid');
    var container = document.getElementById('category-articles-container');
    if (!grid || !container) return;
    var cats = {};
    data.nodes.forEach(function (n) { var c = n.category || 'Other'; if (!cats[c]) cats[c] = []; cats[c].push(n); });

    var allChip = document.createElement('div');
    allChip.className = 'category-card active';
    allChip.setAttribute('data-category', '__all__');
    allChip.innerHTML = '<h3>All</h3>';
    allChip.onclick = function () { toggleCat('__all__'); };
    grid.appendChild(allChip);

    Object.keys(cats).forEach(function (cat) {
      var chip = document.createElement('div');
      chip.className = 'category-card';
      chip.setAttribute('data-category', cat);
      chip.innerHTML = '<h3>' + cat + '</h3> <span class="category-count">' + cats[cat].length + '</span>';
      chip.onclick = function () { toggleCat(cat); };
      grid.appendChild(chip);

      var sec = document.createElement('div');
      sec.className = 'category-articles';
      sec.id = 'articles-' + cat;
      var list = document.createElement('div');
      list.className = 'article-list';
      cats[cat].sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); }).forEach(function (n) {
        var a = document.createElement('a');
        a.className = 'article-list-item';
        a.href = prefix + n.slug + '.html';
        a.innerHTML = '<span class="article-title">' + n.title + '</span><span class="article-date">' + (n.date || '') + '</span>';
        list.appendChild(a);
      });
      sec.appendChild(list);
      container.appendChild(sec);
    });
  }

  var activeCat = '__all__';
  function toggleCat(cat) {
    var chips = document.querySelectorAll('.category-card');
    var arts = document.querySelectorAll('.category-articles');
    var all = document.getElementById('all-articles');
    if (cat === '__all__' || activeCat === cat) {
      chips.forEach(function (c) { c.classList.toggle('active', c.getAttribute('data-category') === '__all__'); });
      arts.forEach(function (a) { a.classList.remove('open'); });
      if (all) all.style.display = '';
      activeCat = '__all__';
    } else {
      chips.forEach(function (c) { c.classList.toggle('active', c.getAttribute('data-category') === cat); });
      arts.forEach(function (a) { a.classList.toggle('open', a.id === 'articles-' + cat); });
      if (all) all.style.display = 'none';
      activeCat = cat;
    }
  }

  /* ==================== D3 Graph ==================== */
  function renderGraph(data) {
    var box = document.getElementById('graph-container');
    var svg = d3.select('#graph-svg');
    var tip = document.getElementById('graph-tooltip');
    if (!box || !svg.node()) return;
    var W = box.clientWidth, H = box.clientHeight;
    svg.attr('viewBox', [0, 0, W, H]);

    var adj = {};
    data.nodes.forEach(function (n) { adj[n.id] = new Set(); });
    data.edges.forEach(function (e) {
      (adj[e.source] = adj[e.source] || new Set()).add(e.target);
      (adj[e.target] = adj[e.target] || new Set()).add(e.source);
    });

    var sim = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.edges).id(function (d) { return d.id; }).distance(80))
      .force('charge', d3.forceManyBody().strength(-280))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide().radius(18));

    var g = svg.append('g');
    svg.call(d3.zoom().scaleExtent([.3, 4]).on('zoom', function (e) { g.attr('transform', e.transform); }));

    var link = g.append('g').selectAll('line').data(data.edges).enter().append('line')
      .attr('stroke', '#ddd').attr('stroke-width', 1.2);

    var R = function (d) { return 6 + (d.connections || 0) * 2; };
    var node = g.append('g').selectAll('circle').data(data.nodes).enter().append('circle')
      .attr('r', R).attr('fill', function (d) { return COLORS[d.category] || COLORS.Other; })
      .attr('stroke', '#fff').attr('stroke-width', 1.5).style('cursor', 'pointer');

    var label = g.append('g').selectAll('text').data(data.nodes).enter().append('text')
      .text(function (d) { return d.title; })
      .attr('font-size', 10).attr('font-family', "'Inter',sans-serif").attr('fill', '#888')
      .attr('text-anchor', 'middle').attr('dy', function (d) { return -(R(d) + 4); })
      .style('pointer-events', 'none');

    node.call(d3.drag()
      .on('start', function (e, d) { if (!e.active) sim.alphaTarget(.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', function (e, d) { d.fx = e.x; d.fy = e.y; })
      .on('end', function (e, d) { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    node.on('mouseenter', function (e, d) {
      var cn = adj[d.id] || new Set();
      node.attr('opacity', function (n) { return n.id === d.id || cn.has(n.id) ? 1 : .12; });
      link.attr('stroke', function (l) { return l.source.id === d.id || l.target.id === d.id ? '#555' : '#eee'; })
        .attr('stroke-width', function (l) { return l.source.id === d.id || l.target.id === d.id ? 2 : 1; });
      label.attr('opacity', function (n) { return n.id === d.id || cn.has(n.id) ? 1 : .08; });
      tip.textContent = d.title; tip.style.opacity = '1';
      var r = box.getBoundingClientRect();
      tip.style.left = (e.clientX - r.left + 12) + 'px';
      tip.style.top = (e.clientY - r.top - 8) + 'px';
    }).on('mouseleave', function () {
      node.attr('opacity', 1); link.attr('stroke', '#ddd').attr('stroke-width', 1.2); label.attr('opacity', 1); tip.style.opacity = '0';
    });

    node.on('click', function (e, d) { e.stopPropagation(); openPanel(d); });
    svg.on('click', closePanel);

    sim.on('tick', function () {
      link.attr('x1', function (d) { return d.source.x; }).attr('y1', function (d) { return d.source.y; })
        .attr('x2', function (d) { return d.target.x; }).attr('y2', function (d) { return d.target.y; });
      node.attr('cx', function (d) { return d.x; }).attr('cy', function (d) { return d.y; });
      label.attr('x', function (d) { return d.x; }).attr('y', function (d) { return d.y; });
    });
  }

  function openPanel(d) {
    var p = document.getElementById('detail-panel'); if (!p) return;
    document.getElementById('detail-title').textContent = d.title;
    document.getElementById('detail-category').textContent = d.category;
    document.getElementById('detail-excerpt').textContent = d.excerpt || '';
    var t = document.getElementById('detail-tags'); t.innerHTML = '';
    (d.tags || []).slice(0, 4).forEach(function (x) { var s = document.createElement('span'); s.textContent = x; t.appendChild(s); });
    document.getElementById('detail-link').href = prefix + d.slug + '.html';
    p.classList.add('open');
  }
  function closePanel() { var p = document.getElementById('detail-panel'); if (p) p.classList.remove('open'); }
  var cb = document.getElementById('detail-close');
  if (cb) cb.addEventListener('click', function (e) { e.stopPropagation(); closePanel(); });
})();
