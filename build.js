#!/usr/bin/env node

/**
 * build.js — Obsidian Vault → Static HTML Generator
 *
 * Scans the Obsidian knowledge vault, parses frontmatter and content,
 * generates article HTML pages and graph-data.json for D3 visualization.
 *
 * Usage: node build.js
 *
 * Dependencies: marked, gray-matter
 * Install: npm install marked gray-matter
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

// ---- Configuration ----
const VAULT_PATH = path.resolve(__dirname, '../csc_knowledge_repository');
const OUTPUT_DIR = path.resolve(__dirname, 'knowledge');
const DATA_DIR = path.resolve(__dirname, 'data');

// Category mapping: Chinese folder names → English category names
const CATEGORY_MAP = {
  '密码学与安全': 'Security',
  '计算机网络': 'Network',
  '前端开发': 'Frontend',
  '机器学习与AI': 'AI',
  '其他': 'Other',
};

// Slug mapping: filename → URL slug
const SLUG_MAP = {
  'AKSK': 'aksk',
  'OAuth 2.0': 'oauth-2-0',
  'OIDC': 'oidc',
  'OIDC（OpenID Connect）': 'oidc',
  'STS': 'sts',
  'JWT': 'jwt',
  'SSRF': 'ssrf',
  '端口': 'port',
  '网关': 'gateway',
  'Node.js': 'nodejs',
  'npm': 'npm',
  'pnpm': 'pnpm',
  'SDK': 'sdk',
  'React Hook': 'react-hook',
  'Transformer': 'transformer',
};

// ---- Helpers ----

function slugify(title) {
  if (SLUG_MAP[title]) return SLUG_MAP[title];
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getCategoryFromPath(filePath) {
  const relative = path.relative(VAULT_PATH, filePath);
  const topDir = relative.split(path.sep)[0];
  return CATEGORY_MAP[topDir] || 'Other';
}

function extractExcerpt(content, maxLen) {
  maxLen = maxLen || 150;
  // Look for the "一句话本质" abstract
  const abstractMatch = content.match(/一句话本质[>\s\n]*(.+?)(?:\n|$)/);
  if (abstractMatch) {
    return abstractMatch[1].trim().substring(0, maxLen);
  }
  // Fallback: first meaningful paragraph
  const lines = content.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (
      line.length > 20 &&
      !line.startsWith('#') &&
      !line.startsWith('>') &&
      !line.startsWith('---') &&
      !line.startsWith('```')
    ) {
      return line.substring(0, maxLen);
    }
  }
  return '';
}

function extractWikiLinks(content) {
  var links = [];
  var regex = /\[\[([^\]]+)\]\]/g;
  var match;
  while ((match = regex.exec(content)) !== null) {
    var linkTitle = match[1].trim();
    if (links.indexOf(linkTitle) === -1) {
      links.push(linkTitle);
    }
  }
  return links;
}

function findAllMarkdownFiles(dir) {
  var results = [];
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden dirs
      if (!entry.name.startsWith('.')) {
        results = results.concat(findAllMarkdownFiles(fullPath));
      }
    } else if (entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

// ---- Configure marked ----
marked.setOptions({
  breaks: true,
  gfm: true,
});

// ---- Main Build ----

function build() {
  console.log('🔨 Building knowledge pages...\n');

  // Ensure output directories exist
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  // Check vault exists
  if (!fs.existsSync(VAULT_PATH)) {
    console.error('❌ Vault not found at:', VAULT_PATH);
    console.error('   Please update VAULT_PATH in build.js');
    process.exit(1);
  }

  // 1. Scan all markdown files
  var mdFiles = findAllMarkdownFiles(VAULT_PATH);
  console.log('📂 Found', mdFiles.length, 'markdown files\n');

  // 2. Parse all files
  var notes = [];
  var titleToNote = {};
  var filenameToNote = {};  // Obsidian links by filename, not title

  for (var i = 0; i < mdFiles.length; i++) {
    var filePath = mdFiles[i];
    var raw = fs.readFileSync(filePath, 'utf-8');
    var parsed = matter(raw);
    var fm = parsed.data;
    var content = parsed.content;
    var title = fm.title || path.basename(filePath, '.md');
    var slug = slugify(title);
    var category = getCategoryFromPath(filePath);
    var excerpt = extractExcerpt(content, 150);
    var bodyWikiLinks = extractWikiLinks(content);

    // Also extract from related frontmatter
    var relatedLinks = [];
    if (fm.related && Array.isArray(fm.related)) {
      for (var j = 0; j < fm.related.length; j++) {
        var rel = fm.related[j];
        var relMatch = rel.match(/\[\[([^\]]+)\]\]/);
        if (relMatch) {
          relatedLinks.push(relMatch[1].trim());
        }
      }
    }

    // Combine all links (body + related frontmatter)
    var allLinks = [];
    var linkSet = {};
    var combined = relatedLinks.concat(bodyWikiLinks);
    for (var k = 0; k < combined.length; k++) {
      if (!linkSet[combined[k]]) {
        linkSet[combined[k]] = true;
        allLinks.push(combined[k]);
      }
    }

    var note = {
      title: title,
      slug: slug,
      category: category,
      date: fm.date ? (fm.date instanceof Date ? fm.date.toISOString().substring(0, 10) : String(fm.date).substring(0, 10)) : '',
      tags: fm.tags || [],
      excerpt: excerpt,
      content: content,
      wikiLinks: allLinks,
      filePath: filePath,
    };

    notes.push(note);
    titleToNote[title] = note;
    // Also register by filename (Obsidian links by filename, not title)
    var filename = path.basename(filePath, '.md');
    filenameToNote[filename] = note;
  }

  // 3. Build edges and connection counts
  var edges = [];
  var edgeSet = {};

  for (var i = 0; i < notes.length; i++) {
    var note = notes[i];
    note.connections = 0;
  }

  for (var i = 0; i < notes.length; i++) {
    var note = notes[i];
    for (var j = 0; j < note.wikiLinks.length; j++) {
      var linkedTitle = note.wikiLinks[j];
      var linkedNote = titleToNote[linkedTitle] || filenameToNote[linkedTitle];
      if (linkedNote) {
        var edgeKey = [note.slug, linkedNote.slug].sort().join('---');
        if (!edgeSet[edgeKey]) {
          edgeSet[edgeKey] = true;
          edges.push({
            source: note.slug,
            target: linkedNote.slug,
          });
        }
      }
    }
  }

  // Count connections
  for (var i = 0; i < edges.length; i++) {
    var edge = edges[i];
    for (var j = 0; j < notes.length; j++) {
      if (notes[j].slug === edge.source || notes[j].slug === edge.target) {
        notes[j].connections++;
      }
    }
  }

  // 4. Generate graph-data.json
  var graphData = {
    nodes: notes.map(function (n) {
      return {
        id: n.slug,
        title: n.title,
        category: n.category,
        slug: n.slug,
        date: n.date,
        excerpt: n.excerpt,
        tags: n.tags.slice(0, 6),
        connections: n.connections,
      };
    }),
    edges: edges,
  };

  var graphPath = path.join(DATA_DIR, 'graph-data.json');
  fs.writeFileSync(graphPath, JSON.stringify(graphData, null, 2));
  console.log('✅ Written', graphPath);

  // 5. Generate article HTML pages
  for (var i = 0; i < notes.length; i++) {
    var note = notes[i];

    // Convert wiki-links in content to HTML links
    var htmlContent = note.content;

    // Replace [[Title]] with <a href="/knowledge/slug.html">Title</a>
    htmlContent = htmlContent.replace(/\[\[([^\]]+)\]\]/g, function (match, linkTitle) {
      var linked = titleToNote[linkTitle.trim()] || filenameToNote[linkTitle.trim()];
      if (linked) {
        return '[' + linkTitle + '](/knowledge/' + linked.slug + '.html)';
      }
      return linkTitle;
    });

    // Convert Obsidian callouts to blockquotes
    htmlContent = htmlContent.replace(/> \[!(\w+)\]\s*(.+)/g, function (match, type, content) {
      return '> **' + content + '**';
    });

    // Convert markdown to HTML
    var bodyHtml = marked.parse(htmlContent);

    // Find related notes for sidebar
    var relatedNotes = [];
    for (var j = 0; j < note.wikiLinks.length; j++) {
      var linked = titleToNote[note.wikiLinks[j]] || filenameToNote[note.wikiLinks[j]];
      if (linked) {
        relatedNotes.push(linked);
      }
    }

    // Build related notes HTML
    var relatedHtml = '';
    if (relatedNotes.length > 0) {
      relatedHtml = '<section class="related-notes">\n';
      relatedHtml += '  <h3>Related Notes</h3>\n';
      relatedHtml += '  <div class="related-notes-grid">\n';
      for (var j = 0; j < relatedNotes.length; j++) {
        var rn = relatedNotes[j];
        relatedHtml += '    <a href="' + rn.slug + '.html" class="related-note-card">\n';
        relatedHtml += '      <div class="related-title">' + rn.title + '</div>\n';
        relatedHtml += '      <div class="related-category">' + rn.category + '</div>\n';
        relatedHtml += '    </a>\n';
      }
      relatedHtml += '  </div>\n';
      relatedHtml += '</section>\n';
    }

    // Build tags HTML
    var tagsHtml = '';
    if (note.tags.length > 0) {
      tagsHtml = '<div class="article-tags">\n';
      for (var j = 0; j < note.tags.length && j < 8; j++) {
        tagsHtml += '  <span class="tag">' + note.tags[j] + '</span>\n';
      }
      tagsHtml += '</div>\n';
    }

    // Build full page HTML
    var pageHtml = buildArticlePage({
      title: note.title,
      date: note.date,
      category: note.category,
      tagsHtml: tagsHtml,
      bodyHtml: bodyHtml,
      relatedHtml: relatedHtml,
    });

    var outputPath = path.join(OUTPUT_DIR, note.slug + '.html');
    fs.writeFileSync(outputPath, pageHtml);
    console.log('✅ Written', outputPath);
  }

  console.log('\n🎉 Build complete!', notes.length, 'articles generated.\n');
}

// ---- Article Page Template ----

function buildArticlePage(opts) {
  return '<!DOCTYPE html>\n' +
    '<html lang="zh-CN">\n' +
    '<head>\n' +
    '  <meta charset="UTF-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '  <title>' + opts.title + ' — ChenSchenG</title>\n' +
    '  <link rel="icon" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><text y=\'.9em\' font-size=\'90\'>⚡</text></svg>">\n' +
    '  <link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">\n' +
    '  <link rel="stylesheet" href="../css/style.css">\n' +
    '  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">\n' +
    '  <style>.hljs{background:var(--bg-sec)!important}</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <nav id="nav">\n' +
    '    <div class="nav-logo"><a href="/">ChenSchenG</a></div>\n' +
    '    <div class="nav-links-wrapper">\n' +
    '      <ul class="nav-links">\n' +
    '        <li><a href="/">Home</a></li>\n' +
    '        <li><a href="/#graph">Graph</a></li>\n' +
    '        <li><a href="/about.html">About</a></li>\n' +
    '      </ul>\n' +
    '    </div>\n' +
    '    <button class="hamburger" id="hamburger" aria-label="Menu"><span class="hamburger-inner"></span></button>\n' +
    '  </nav>\n' +
    '  <div class="mobile-menu-overlay" id="mobile-overlay"></div>\n' +
    '  <aside class="mobile-menu" id="mobile-menu">\n' +
    '    <ul>\n' +
    '      <li><a href="/">Home</a></li>\n' +
    '      <li><a href="/#graph">Graph</a></li>\n' +
    '      <li><a href="/about.html">About</a></li>\n' +
    '    </ul>\n' +
    '  </aside>\n' +
    '\n' +
    '  <main class="article-page">\n' +
    '    <article>\n' +
    '      <header class="article-header">\n' +
    '        <div class="article-breadcrumb">\n' +
    '          <a href="/">Home</a>\n' +
    '          <span class="separator">/</span>\n' +
    '          <span>' + opts.category + '</span>\n' +
    '        </div>\n' +
    '        <h1>' + opts.title + '</h1>\n' +
    '        <div class="article-meta">\n' +
    '          <span>' + opts.date + '</span>\n' +
    '          <span>' + opts.category + '</span>\n' +
    '        </div>\n' +
    '        ' + opts.tagsHtml + '\n' +
    '      </header>\n' +
    '\n' +
    '      <div class="article-body">\n' +
    '        ' + opts.bodyHtml + '\n' +
    '      </div>\n' +
    '    </article>\n' +
    '\n' +
    '    ' + opts.relatedHtml + '\n' +
    '\n' +
    '    <div style="max-width:800px;margin:0 auto;padding-bottom:60px;">\n' +
    '      <a href="/knowledge/" class="back-link">Back to Knowledge Graph</a>\n' +
    '    </div>\n' +
    '  </main>\n' +
    '\n' +
    '  <!-- Footer -->\n' +
    '  <footer>\n' +
    '    <p>Designed &amp; Built by <a href="https://github.com/ChenSchenG">ChenSchenG</a></p>\n' +
    '  </footer>\n' +
    '\n' +
    '  <script src="../js/main.js"></script>\n' +
    '  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>\n' +
    '  <script>hljs.highlightAll();</script>\n' +
    '</body>\n' +
    '</html>';
}

// ---- Run ----
build();
