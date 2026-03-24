/**
 * graph.js — D3.js Knowledge Graph
 * Loads data/graph-data.json, renders interactive force-directed graph
 */

(function () {
  'use strict';

  // Category color map
  const CATEGORY_COLORS = {
    Security: '#ff6b6b',
    Network: '#4ecdc4',
    Frontend: '#45b7d1',
    AI: '#a55eea',
    Other: '#778ca3',
  };

  const CATEGORY_ICONS = {
    Security: '🔐',
    Network: '🌐',
    Frontend: '⚛️',
    AI: '🤖',
    Other: '📦',
  };

  // ---- Load graph data ----
  const basePath = document.querySelector('script[src*="graph.js"]')
    ? '../data/graph-data.json'
    : 'data/graph-data.json';

  fetch(basePath)
    .then(function (res) {
      if (!res.ok) throw new Error('Failed to load graph data');
      return res.json();
    })
    .then(function (data) {
      renderGraph(data);
      renderCategoryDirectory(data);
    })
    .catch(function (err) {
      console.error('Graph data load error:', err);
      // Show fallback message
      const container = document.getElementById('graph-container');
      if (container) {
        container.innerHTML =
          '<p style="text-align:center;padding:40px;color:var(--slate);">Knowledge graph data not yet generated. Run <code>node build.js</code> to generate.</p>';
      }
    });

  // ---- Render Force Graph ----
  function renderGraph(data) {
    const container = document.getElementById('graph-container');
    const svg = d3.select('#graph-svg');
    const tooltip = document.getElementById('graph-tooltip');

    if (!container || !svg.node()) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr('viewBox', [0, 0, width, height]);

    // Build node map for quick lookup
    const nodeMap = {};
    data.nodes.forEach(function (n) {
      nodeMap[n.id] = n;
    });

    // Build adjacency sets
    const adjacency = {};
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
    const simulation = d3
      .forceSimulation(data.nodes)
      .force(
        'link',
        d3
          .forceLink(data.edges)
          .id(function (d) {
            return d.id;
          })
          .distance(80)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(20));

    // Zoom
    const g = svg.append('g');

    const zoom = d3
      .zoom()
      .scaleExtent([0.3, 4])
      .on('zoom', function (event) {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Edges
    const link = g
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(data.edges)
      .enter()
      .append('line')
      .attr('stroke', '#233554')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6);

    // Nodes
    const node = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('circle')
      .data(data.nodes)
      .enter()
      .append('circle')
      .attr('r', function (d) {
        return 8 + (d.connections || 0) * 3;
      })
      .attr('fill', function (d) {
        return CATEGORY_COLORS[d.category] || CATEGORY_COLORS.Other;
      })
      .attr('stroke', 'rgba(255,255,255,0.1)')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer');

    // Node labels
    const label = g
      .append('g')
      .attr('class', 'labels')
      .selectAll('text')
      .data(data.nodes)
      .enter()
      .append('text')
      .text(function (d) {
        return d.title;
      })
      .attr('font-size', 11)
      .attr('font-family', "'Inter', sans-serif")
      .attr('fill', '#a8b2d1')
      .attr('text-anchor', 'middle')
      .attr('dy', function (d) {
        return -(12 + (d.connections || 0) * 3);
      })
      .style('pointer-events', 'none');

    // Drag behavior
    const drag = d3
      .drag()
      .on('start', function (event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', function (event, d) {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', function (event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(drag);

    // Hover effects
    node
      .on('mouseenter', function (event, d) {
        // Highlight connected
        const connected = adjacency[d.id] || new Set();

        node
          .attr('opacity', function (n) {
            return n.id === d.id || connected.has(n.id) ? 1 : 0.15;
          })
          .attr('r', function (n) {
            var base = 8 + (n.connections || 0) * 3;
            return n.id === d.id ? base * 1.4 : base;
          });

        link
          .attr('stroke-opacity', function (l) {
            return l.source.id === d.id || l.target.id === d.id ? 1 : 0.05;
          })
          .attr('stroke', function (l) {
            return l.source.id === d.id || l.target.id === d.id
              ? '#64ffda'
              : '#233554';
          });

        label.attr('opacity', function (n) {
          return n.id === d.id || connected.has(n.id) ? 1 : 0.1;
        });

        // Tooltip
        tooltip.textContent = d.title;
        tooltip.style.opacity = '1';
        const rect = container.getBoundingClientRect();
        tooltip.style.left = event.clientX - rect.left + 15 + 'px';
        tooltip.style.top = event.clientY - rect.top - 10 + 'px';
      })
      .on('mouseleave', function () {
        node
          .attr('opacity', 1)
          .attr('r', function (d) {
            return 8 + (d.connections || 0) * 3;
          });
        link.attr('stroke-opacity', 0.6).attr('stroke', '#233554');
        label.attr('opacity', 1);
        tooltip.style.opacity = '0';
      });

    // Click: open detail panel
    node.on('click', function (event, d) {
      event.stopPropagation();
      openDetailPanel(d);
    });

    // Click on background to close panel
    svg.on('click', function () {
      closeDetailPanel();
    });

    // Tick
    simulation.on('tick', function () {
      link
        .attr('x1', function (d) {
          return d.source.x;
        })
        .attr('y1', function (d) {
          return d.source.y;
        })
        .attr('x2', function (d) {
          return d.target.x;
        })
        .attr('y2', function (d) {
          return d.target.y;
        });

      node
        .attr('cx', function (d) {
          return d.x;
        })
        .attr('cy', function (d) {
          return d.y;
        });

      label
        .attr('x', function (d) {
          return d.x;
        })
        .attr('y', function (d) {
          return d.y;
        });
    });
  }

  // ---- Detail Panel ----
  function openDetailPanel(d) {
    var panel = document.getElementById('detail-panel');
    document.getElementById('detail-title').textContent = d.title;
    document.getElementById('detail-category').textContent = d.category;
    document.getElementById('detail-excerpt').textContent =
      d.excerpt || 'No excerpt available.';

    var tagsContainer = document.getElementById('detail-tags');
    tagsContainer.innerHTML = '';
    if (d.tags && d.tags.length > 0) {
      d.tags.slice(0, 6).forEach(function (tag) {
        var span = document.createElement('span');
        span.textContent = tag;
        tagsContainer.appendChild(span);
      });
    }

    document.getElementById('detail-link').href = d.slug + '.html';
    panel.classList.add('open');
  }

  function closeDetailPanel() {
    var panel = document.getElementById('detail-panel');
    if (panel) panel.classList.remove('open');
  }

  // Close button
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
    var articlesContainer = document.getElementById(
      'category-articles-container'
    );
    if (!grid || !articlesContainer) return;

    // Group notes by category
    var categories = {};
    data.nodes.forEach(function (node) {
      var cat = node.category || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(node);
    });

    // Render category cards
    Object.keys(categories).forEach(function (cat) {
      var nodes = categories[cat];

      // Card
      var card = document.createElement('div');
      card.className = 'category-card';
      card.setAttribute('data-category', cat);
      card.innerHTML =
        '<span class="category-icon">' +
        (CATEGORY_ICONS[cat] || '📦') +
        '</span>' +
        '<h3>' +
        cat +
        '</h3>' +
        '<span class="category-count">' +
        nodes.length +
        (nodes.length === 1 ? ' note' : ' notes') +
        '</span>';

      card.addEventListener('click', function () {
        toggleCategory(cat);
      });

      grid.appendChild(card);

      // Article list
      var articleSection = document.createElement('div');
      articleSection.className = 'category-articles';
      articleSection.id = 'articles-' + cat;

      var list = document.createElement('div');
      list.className = 'article-list';

      nodes.forEach(function (node) {
        var item = document.createElement('a');
        item.className = 'article-list-item';
        item.href = node.slug + '.html';
        item.innerHTML =
          '<span class="article-title">' +
          node.title +
          '</span>' +
          '<span class="article-date">' +
          (node.date || '') +
          '</span>';
        list.appendChild(item);
      });

      articleSection.appendChild(list);
      articlesContainer.appendChild(articleSection);
    });
  }

  var activeCategory = null;

  function toggleCategory(cat) {
    var cards = document.querySelectorAll('.category-card');
    var articles = document.querySelectorAll('.category-articles');

    if (activeCategory === cat) {
      // Close
      cards.forEach(function (c) {
        c.classList.remove('active');
      });
      articles.forEach(function (a) {
        a.classList.remove('open');
      });
      activeCategory = null;
    } else {
      // Open
      cards.forEach(function (c) {
        c.classList.toggle(
          'active',
          c.getAttribute('data-category') === cat
        );
      });
      articles.forEach(function (a) {
        a.classList.toggle('open', a.id === 'articles-' + cat);
      });
      activeCategory = cat;

      // Scroll to articles
      var el = document.getElementById('articles-' + cat);
      if (el) {
        setTimeout(function () {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    }
  }
})();
