/**
 * graph.js — D3.js Knowledge Graph + Article Table
 * White theme, works from both root (/) and /knowledge/
 */

(function () {
  'use strict';

  var CATEGORY_COLORS = {
    Security: '#e74c3c',
    Network: '#27ae60',
    Frontend: '#2980b9',
    AI: '#8e44ad',
    Other: '#7f8c8d',
  };

  var CATEGORY_ICONS = {
    Security: '🔐',
    Network: '🌐',
    Frontend: '⚛️',
    AI: '🤖',
    Other: '📦',
  };

  // Detect path context
  var isSubdir = window.location.pathname.indexOf('/knowledge/') !== -1;
  var dataPath = isSubdir ? '../data/graph-data.json' : 'data/graph-data.json';
  var articlePrefix = isSubdir ? '' : 'knowledge/';

  fetch(dataPath)
    .then(function (res) {
      if (!res.ok) throw new Error('Failed to load graph data');
      return res.json();
    })
    .then(function (data) {
      renderGraph(data);
      renderCategoryChips(data);
      renderArticleTable(data);
    })
    .catch(function (err) {
      console.error('Graph data load error:', err);
      var c = document.getElementById('graph-container');
      if (c) c.innerHTML = '<p style="text-align:center;padding:40px;color:#8b8da3;">Run <code>node build.js</code> to generate graph data.</p>';
    });

  /* ===================== Force Graph ===================== */
  function renderGraph(data) {
    var container = document.getElementById('graph-container');
    var svg = d3.select('#graph-svg');
    var tooltip = document.getElementById('graph-tooltip');
    if (!container || !svg.node()) return;

    var width = container.clientWidth;
    var height = container.clientHeight;
    svg.attr('viewBox', [0, 0, width, height]);

    var adjacency = {};
    data.nodes.forEach(function (n) { adjacency[n.id] = new Set(); });
    data.edges.forEach(function (e) {
      adjacency[e.source] = adjacency[e.source] || new Set();
      adjacency[e.target] = adjacency[e.target] || new Set();
      adjacency[e.source].add(e.target);
      adjacency[e.target].add(e.source);
    });

    var simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.edges).id(function (d) { return d.id; }).distance(80))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(20));

    var g = svg.append('g');
    svg.call(d3.zoom().scaleExtent([0.3, 4]).on('zoom', function (event) { g.attr('transform', event.transform); }));

    var link = g.append('g').selectAll('line').data(data.edges).enter().append('line')
      .attr('stroke', '#ddd').attr('stroke-width', 1.2).attr('stroke-opacity', 0.7);

    var node = g.append('g').selectAll('circle').data(data.nodes).enter().append('circle')
      .attr('r', function (d) { return 7 + (d.connections || 0) * 2.5; })
      .attr('fill', function (d) { return CATEGORY_COLORS[d.category] || CATEGORY_COLORS.Other; })
      .attr('stroke', '#fff').attr('stroke-width', 2)
      .style('cursor', 'pointer');

    var label = g.append('g').selectAll('text').data(data.nodes).enter().append('text')
      .text(function (d) { return d.title; })
      .attr('font-size', 11).attr('font-family', "'Inter', sans-serif").attr('fill', '#555770')
      .attr('text-anchor', 'middle')
      .attr('dy', function (d) { return -(11 + (d.connections || 0) * 2.5); })
      .style('pointer-events', 'none');

    var drag = d3.drag()
      .on('start', function (event, d) { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', function (event, d) { d.fx = event.x; d.fy = event.y; })
      .on('end', function (event, d) { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; });
    node.call(drag);

    node
      .on('mouseenter', function (event, d) {
        var connected = adjacency[d.id] || new Set();
        node.attr('opacity', function (n) { return n.id === d.id || connected.has(n.id) ? 1 : 0.15; })
          .attr('r', function (n) { var b = 7 + (n.connections || 0) * 2.5; return n.id === d.id ? b * 1.4 : b; });
        link.attr('stroke-opacity', function (l) { return l.source.id === d.id || l.target.id === d.id ? 1 : 0.05; })
          .attr('stroke', function (l) { return l.source.id === d.id || l.target.id === d.id ? '#1a1a2e' : '#ddd'; })
          .attr('stroke-width', function (l) { return l.source.id === d.id || l.target.id === d.id ? 2 : 1.2; });
        label.attr('opacity', function (n) { return n.id === d.id || connected.has(n.id) ? 1 : 0.1; });
        tooltip.textContent = d.title;
        tooltip.style.opacity = '1';
        var rect = container.getBoundingClientRect();
        tooltip.style.left = (event.clientX - rect.left + 14) + 'px';
        tooltip.style.top = (event.clientY - rect.top - 10) + 'px';
      })
      .on('mouseleave', function () {
        node.attr('opacity', 1).attr('r', function (d) { return 7 + (d.connections || 0) * 2.5; });
        link.attr('stroke-opacity', 0.7).attr('stroke', '#ddd').attr('stroke-width', 1.2);
        label.attr('opacity', 1);
        tooltip.style.opacity = '0';
      });

    node.on('click', function (event, d) { event.stopPropagation(); openDetailPanel(d); });
    svg.on('click', function () { closeDetailPanel(); });

    simulation.on('tick', function () {
      link.attr('x1', function (d) { return d.source.x; }).attr('y1', function (d) { return d.source.y; })
        .attr('x2', function (d) { return d.target.x; }).attr('y2', function (d) { return d.target.y; });
      node.attr('cx', function (d) { return d.x; }).attr('cy', function (d) { return d.y; });
      label.attr('x', function (d) { return d.x; }).attr('y', function (d) { return d.y; });
    });
  }

  /* ===================== Detail Panel ===================== */
  function openDetailPanel(d) {
    var panel = document.getElementById('detail-panel');
    if (!panel) return;
    document.getElementById('detail-title').textContent = d.title;
    document.getElementById('detail-category').textContent = d.category;
    document.getElementById('detail-excerpt').textContent = d.excerpt || '';
    var tags = document.getElementById('detail-tags');
    tags.innerHTML = '';
    (d.tags || []).slice(0, 5).forEach(function (t) { var s = document.createElement('span'); s.textContent = t; tags.appendChild(s); });
    document.getElementById('detail-link').href = articlePrefix + d.slug + '.html';
    panel.classList.add('open');
  }
  function closeDetailPanel() { var p = document.getElementById('detail-panel'); if (p) p.classList.remove('open'); }
  var cb = document.getElementById('detail-close');
  if (cb) cb.addEventListener('click', function (e) { e.stopPropagation(); closeDetailPanel(); });

  /* ===================== Category Chips ===================== */
  function renderCategoryChips(data) {
    var grid = document.getElementById('category-grid');
    var articlesContainer = document.getElementById('category-articles-container');
    if (!grid || !articlesContainer) return;

    var categories = {};
    data.nodes.forEach(function (n) { var c = n.category || 'Other'; if (!categories[c]) categories[c] = []; categories[c].push(n); });

    // "All" chip
    var allChip = document.createElement('div');
    allChip.className = 'category-card active';
    allChip.setAttribute('data-category', '__all__');
    allChip.innerHTML = '<h3>All</h3> <span class="category-count">' + data.nodes.length + '</span>';
    allChip.addEventListener('click', function () { toggleCategory('__all__'); });
    grid.appendChild(allChip);

    Object.keys(categories).forEach(function (cat) {
      var nodes = categories[cat];
      var chip = document.createElement('div');
      chip.className = 'category-card';
      chip.setAttribute('data-category', cat);
      chip.innerHTML = '<span class="category-icon">' + (CATEGORY_ICONS[cat] || '📦') + '</span><h3>' + cat + '</h3> <span class="category-count">' + nodes.length + '</span>';
      chip.addEventListener('click', function () { toggleCategory(cat); });
      grid.appendChild(chip);

      // article list for this category
      var section = document.createElement('div');
      section.className = 'category-articles';
      section.id = 'articles-' + cat;
      var list = document.createElement('div');
      list.className = 'article-list';
      nodes.forEach(function (n) {
        var item = document.createElement('a');
        item.className = 'article-list-item';
        item.href = articlePrefix + n.slug + '.html';
        item.innerHTML = '<span class="article-title">' + n.title + '</span><span class="article-date">' + (n.date || '') + '</span>';
        list.appendChild(item);
      });
      section.appendChild(list);
      articlesContainer.appendChild(section);
    });
  }

  var activeCategory = '__all__';
  function toggleCategory(cat) {
    var chips = document.querySelectorAll('.category-card');
    var catArticles = document.querySelectorAll('.category-articles');
    var allArticles = document.getElementById('all-articles');

    if (cat === '__all__') {
      chips.forEach(function (c) { c.classList.toggle('active', c.getAttribute('data-category') === '__all__'); });
      catArticles.forEach(function (a) { a.classList.remove('open'); });
      if (allArticles) allArticles.style.display = '';
      activeCategory = '__all__';
    } else if (activeCategory === cat) {
      // clicking same = go back to all
      toggleCategory('__all__');
      return;
    } else {
      chips.forEach(function (c) { c.classList.toggle('active', c.getAttribute('data-category') === cat); });
      catArticles.forEach(function (a) { a.classList.toggle('open', a.id === 'articles-' + cat); });
      if (allArticles) allArticles.style.display = 'none';
      activeCategory = cat;
    }
  }

  /* ===================== Article Table (bchiang7 style) ===================== */
  function renderArticleTable(data) {
    var container = document.getElementById('all-articles');
    if (!container) return;

    var sorted = data.nodes.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });

    var table = document.createElement('table');
    table.className = 'article-table';

    // thead
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    ['Year', 'Title', 'Category', 'Tags'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      th.className = 'col-' + h.toLowerCase();
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    // tbody
    var tbody = document.createElement('tbody');
    var lastYear = '';

    sorted.forEach(function (n) {
      var year = (n.date || '').substring(0, 4);
      var tr = document.createElement('tr');
      tr.addEventListener('click', function () { window.location.href = articlePrefix + n.slug + '.html'; });

      // year
      var tdYear = document.createElement('td');
      tdYear.className = 'col-year';
      tdYear.textContent = year !== lastYear ? year : '';
      lastYear = year;
      tr.appendChild(tdYear);

      // title
      var tdTitle = document.createElement('td');
      tdTitle.className = 'col-title';
      var a = document.createElement('a');
      a.href = articlePrefix + n.slug + '.html';
      a.textContent = n.title;
      a.addEventListener('click', function (e) { e.stopPropagation(); });
      tdTitle.appendChild(a);
      tr.appendChild(tdTitle);

      // category
      var tdCat = document.createElement('td');
      tdCat.className = 'col-category';
      tdCat.textContent = n.category;
      tr.appendChild(tdCat);

      // tags (first 3)
      var tdTags = document.createElement('td');
      tdTags.className = 'col-tags';
      (n.tags || []).slice(2, 5).forEach(function (t) {
        var s = document.createElement('span');
        s.textContent = t;
        tdTags.appendChild(s);
      });
      tr.appendChild(tdTags);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  }
})();
