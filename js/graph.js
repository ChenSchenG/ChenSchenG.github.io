/**
 * graph.js — D3.js Knowledge Graph
 * Loads data/graph-data.json, renders interactive force-directed graph
 * Works from both root (/) and /knowledge/ pages
 */

(function () {
  'use strict';

  // Category color map
  var CATEGORY_COLORS = {
    Security: '#ff6b6b',
    Network: '#4ecdc4',
    Frontend: '#45b7d1',
    AI: '#a55eea',
    Other: '#778ca3',
  };

  var CATEGORY_ICONS = {
    Security: '🔐',
    Network: '🌐',
    Frontend: '⚛️',
    AI: '🤖',
    Other: '📦',
  };

  // Detect if we're in /knowledge/ subdirectory or root
  var isSubdir = window.location.pathname.indexOf('/knowledge/') !== -1;
  var dataPath = isSubdir ? '../data/graph-data.json' : 'data/graph-data.json';
  var articlePrefix = isSubdir ? '' : 'knowledge/';

  // ---- Load graph data ----
  fetch(dataPath)
    .then(function (res) {
      if (!res.ok) throw new Error('Failed to load graph data');
      return res.json();
    })
    .then(function (data) {
      renderGraph(data);
      renderCategoryDirectory(data);
      renderAllArticles(data);
    })
    .catch(function (err) {
      console.error('Graph data load error:', err);
      var container = document.getElementById('graph-container');
      if (container) {
        container.innerHTML =
          '<p style="text-align:center;padding:40px;color:var(--slate);">Knowledge graph data not yet generated. Run <code>node build.js</code> to generate.</p>';
      }
    });

  // ---- Render Force Graph ----
  function renderGraph(data) {
    var container = document.getElementById('graph-container');
    var svg = d3.select('#graph-svg');
    var tooltip = document.getElementById('graph-tooltip');

    if (!container || !svg.node()) return;

    var width = container.clientWidth;
    var height = container.clientHeight;

    svg.attr('viewBox', [0, 0, width, height]);

    // Build adjacency sets
    var adjacency = {};
    data.nodes.forEach(function (n) {
      adjacency[n.id] = new Set();
    });
    data.edges.forEach(function (e) {
      adjacency[e.source] = adjacency[e.source] || new Set();
      adjacency[e.target] = adjacency[e.target] || new Set();
      adjacency[e.source].add(e.target);
      adjacency[e.target].add(e.source);
    });

    // Force simulation
    var simulation = d3
      .forceSimulation(data.nodes)
      .force(
        'link',
        d3
          .forceLink(data.edges)
          .id(function (d) { return d.id; })
          .distance(80)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(20));

    // Zoom group
    var g = svg.append('g');

    var zoom = d3
      .zoom()
      .scaleExtent([0.3, 4])
      .on('zoom', function (event) {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Edges
    var link = g
      .append('g')
      .selectAll('line')
      .data(data.edges)
      .enter()
      .append('line')
      .attr('stroke', '#233554')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6);

    // Nodes
    var node = g
      .append('g')
      .selectAll('circle')
      .data(data.nodes)
      .enter()
      .append('circle')
      .attr('r', function (d) { return 8 + (d.connections || 0) * 3; })
      .attr('fill', function (d) { return CATEGORY_COLORS[d.category] || CATEGORY_COLORS.Other; })
      .attr('stroke', 'rgba(255,255,255,0.1)')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer');

    // Node labels
    var label = g
      .append('g')
      .selectAll('text')
      .data(data.nodes)
      .enter()
      .append('text')
      .text(function (d) { return d.title; })
      .attr('font-size', 11)
      .attr('font-family', "'Inter', sans-serif")
      .attr('fill', '#a8b2d1')
      .attr('text-anchor', 'middle')
      .attr('dy', function (d) { return -(12 + (d.connections || 0) * 3); })
      .style('pointer-events', 'none');

    // Drag
    var drag = d3
      .drag()
      .on('start', function (event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', function (event, d) {
        d.fx = event.x; d.fy = event.y;
      })
      .on('end', function (event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      });

    node.call(drag);

    // Hover
    node
      .on('mouseenter', function (event, d) {
        var connected = adjacency[d.id] || new Set();

        node
          .attr('opacity', function (n) { return n.id === d.id || connected.has(n.id) ? 1 : 0.15; })
          .attr('r', function (n) {
            var base = 8 + (n.connections || 0) * 3;
            return n.id === d.id ? base * 1.4 : base;
          });

        link
          .attr('stroke-opacity', function (l) {
            return l.source.id === d.id || l.target.id === d.id ? 1 : 0.05;
          })
          .attr('stroke', function (l) {
            return l.source.id === d.id || l.target.id === d.id ? '#64ffda' : '#233554';
          });

        label.attr('opacity', function (n) {
          return n.id === d.id || connected.has(n.id) ? 1 : 0.1;
        });

        tooltip.textContent = d.title;
        tooltip.style.opacity = '1';
        var rect = container.getBoundingClientRect();
        tooltip.style.left = (event.clientX - rect.left + 15) + 'px';
        tooltip.style.top = (event.clientY - rect.top - 10) + 'px';
      })
      .on('mouseleave', function () {
        node.attr('opacity', 1).attr('r', function (d) { return 8 + (d.connections || 0) * 3; });
        link.attr('stroke-opacity', 0.6).attr('stroke', '#233554');
        label.attr('opacity', 1);
        tooltip.style.opacity = '0';
      });

    // Click → detail panel
    node.on('click', function (event, d) {
      event.stopPropagation();
      openDetailPanel(d);
    });

    svg.on('click', function () { closeDetailPanel(); });

    // Tick
    simulation.on('tick', function () {
      link
        .attr('x1', function (d) { return d.source.x; })
        .attr('y1', function (d) { return d.source.y; })
        .attr('x2', function (d) { return d.target.x; })
        .attr('y2', function (d) { return d.target.y; });

      node
        .attr('cx', function (d) { return d.x; })
        .attr('cy', function (d) { return d.y; });

      label
        .attr('x', function (d) { return d.x; })
        .attr('y', function (d) { return d.y; });
    });
  }

  // ---- Detail Panel ----
  function openDetailPanel(d) {
    var panel = document.getElementById('detail-panel');
    if (!panel) return;
    document.getElementById('detail-title').textContent = d.title;
    document.getElementById('detail-category').textContent = d.category;
    document.getElementById('detail-excerpt').textContent = d.excerpt || 'No excerpt available.';

    var tagsContainer = document.getElementById('detail-tags');
    tagsContainer.innerHTML = '';
    if (d.tags && d.tags.length > 0) {
      d.tags.slice(0, 6).forEach(function (tag) {
        var span = document.createElement('span');
        span.textContent = tag;
        tagsContainer.appendChild(span);
      });
    }

    document.getElementById('detail-link').href = articlePrefix + d.slug + '.html';
    panel.classList.add('open');
  }

  function closeDetailPanel() {
    var panel = document.getElementById('detail-panel');
    if (panel) panel.classList.remove('open');
  }

  var closeBtn = document.getElementById('detail-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeDetailPanel();
    });
  }

  // ---- Category Directory ----
  function renderCategoryDirectory(data) {
    var grid = document.getElementById('category-grid');
    var articlesContainer = document.getElementById('category-articles-container');
    if (!grid || !articlesContainer) return;

    // Group by category
    var categories = {};
    data.nodes.forEach(function (node) {
      var cat = node.category || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(node);
    });

    Object.keys(categories).forEach(function (cat) {
      var nodes = categories[cat];

      // Card
      var card = document.createElement('div');
      card.className = 'category-card';
      card.setAttribute('data-category', cat);
      card.innerHTML =
        '<span class="category-icon">' + (CATEGORY_ICONS[cat] || '📦') + '</span>' +
        '<h3>' + cat + '</h3>' +
        '<span class="category-count">' + nodes.length + (nodes.length === 1 ? ' note' : ' notes') + '</span>';
      card.addEventListener('click', function () { toggleCategory(cat); });
      grid.appendChild(card);

      // Article list per category
      var section = document.createElement('div');
      section.className = 'category-articles';
      section.id = 'articles-' + cat;

      var list = document.createElement('div');
      list.className = 'article-list';

      nodes.forEach(function (n) {
        var item = document.createElement('a');
        item.className = 'article-list-item';
        item.href = articlePrefix + n.slug + '.html';
        item.innerHTML =
          '<span class="article-title">' + n.title + '</span>' +
          '<span class="article-date">' + (n.date || '') + '</span>';
        list.appendChild(item);
      });

      section.appendChild(list);
      articlesContainer.appendChild(section);
    });
  }

  var activeCategory = null;

  function toggleCategory(cat) {
    var cards = document.querySelectorAll('.category-card');
    var articles = document.querySelectorAll('.category-articles');
    var allArticles = document.getElementById('all-articles');

    if (activeCategory === cat) {
      cards.forEach(function (c) { c.classList.remove('active'); });
      articles.forEach(function (a) { a.classList.remove('open'); });
      if (allArticles) allArticles.style.display = '';
      activeCategory = null;
    } else {
      cards.forEach(function (c) {
        c.classList.toggle('active', c.getAttribute('data-category') === cat);
      });
      articles.forEach(function (a) {
        a.classList.toggle('open', a.id === 'articles-' + cat);
      });
      if (allArticles) allArticles.style.display = 'none';
      activeCategory = cat;

      var el = document.getElementById('articles-' + cat);
      if (el) {
        setTimeout(function () {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    }
  }

  // ---- All Articles List (for home page) ----
  function renderAllArticles(data) {
    var container = document.getElementById('all-articles');
    if (!container) return; // only exists on home page

    // Sort by date descending
    var sorted = data.nodes.slice().sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '');
    });

    sorted.forEach(function (n) {
      var item = document.createElement('a');
      item.className = 'article-list-item';
      item.href = articlePrefix + n.slug + '.html';

      var dot = document.createElement('span');
      dot.className = 'article-category-dot';
      dot.style.backgroundColor = CATEGORY_COLORS[n.category] || CATEGORY_COLORS.Other;

      var title = document.createElement('span');
      title.className = 'article-title';
      title.textContent = n.title;

      var catLabel = document.createElement('span');
      catLabel.className = 'article-category-label';
      catLabel.textContent = n.category;

      var date = document.createElement('span');
      date.className = 'article-date';
      date.textContent = n.date || '';

      item.appendChild(dot);
      item.appendChild(title);
      item.appendChild(catLabel);
      item.appendChild(date);
      container.appendChild(item);
    });
  }
})();
