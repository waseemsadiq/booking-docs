#!/usr/bin/env node
/**
 * Build Search Index
 *
 * Generates a searchable index from all markdown documentation files.
 * Outputs to assets/search-index.json
 *
 * Run: node build-search-index.js
 */

const fs = require('fs');
const path = require('path');

// Page configuration (mirrors index.html PAGES object)
const PAGES = {
  'admin-guide':     { src: './docs/admin-guide.md',           title: 'Admin Guide' },
  'getting-started': { src: './docs/wiki/Getting-Started.md',  title: 'Getting Started' },
  'architecture':    { src: './docs/wiki/Architecture.md',     title: 'Architecture' },
  'galvani-rules':   { src: './docs/wiki/Galvani-Rules.md',    title: 'Galvani Rules' },
  'database':        { src: './docs/wiki/Database.md',         title: 'Database' },
  'developer-guide': { src: './docs/dev-guide.md',             title: 'Developer Guide' },
  'api-reference':   { src: './docs/api-reference.md',         title: 'REST API Reference' },
  'mcp-server':      { src: './docs/wiki/MCP-Servers.md',      title: 'MCP Server' },
  'deployment':      { src: './docs/wiki/Deployment.md',       title: 'Deployment' },
  'contributing':    { src: './docs/wiki/Contributing.md',     title: 'Contributing' },
};

/**
 * Extract searchable sections from markdown
 */
function parseMarkdown(content, pageId, pageTitle) {
  const sections = [];
  const lines = content.split('\n');

  let currentHeading = null;
  let currentHeadingLevel = 0;
  let currentText = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#+)\s+(.+)$/);

    if (headingMatch) {
      // Save previous section if it exists
      if (currentHeading && currentText.length > 0) {
        const snippet = currentText
          .join(' ')
          .trim()
          .replace(/\s+/g, ' ')
          .substring(0, 150);

        sections.push({
          pageId,
          pageTitle,
          title: currentHeading,
          level: currentHeadingLevel,
          anchor: currentHeading
            .toLowerCase()
            .replace(/<[^>]*>/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, ''),
          snippet: snippet || pageTitle,
          content: currentText.join(' ').trim()
        });
      }

      // Start new section
      currentHeadingLevel = headingMatch[1].length;
      currentHeading = headingMatch[2].trim();
      currentText = [];
    } else if (line.trim() && !line.startsWith('```')) {
      // Collect text content, skip code blocks
      if (!lines[i-1]?.startsWith('```')) {
        currentText.push(line.trim());
      }
    }
  }

  // Save last section
  if (currentHeading && currentText.length > 0) {
    const snippet = currentText
      .join(' ')
      .trim()
      .replace(/\s+/g, ' ')
      .substring(0, 150);

    sections.push({
      pageId,
      pageTitle,
      title: currentHeading,
      level: currentHeadingLevel,
      anchor: currentHeading
        .toLowerCase()
        .replace(/<[^>]*>/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
      snippet: snippet || pageTitle,
      content: currentText.join(' ').trim()
    });
  }

  return sections;
}

/**
 * Build complete search index
 */
function buildSearchIndex() {
  const allSections = [];

  console.log('Building search index...');

  for (const [pageId, pageConfig] of Object.entries(PAGES)) {
    try {
      const filePath = path.join(__dirname, pageConfig.src);

      if (!fs.existsSync(filePath)) {
        console.warn(`⚠ File not found: ${filePath}`);
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const sections = parseMarkdown(content, pageId, pageConfig.title);
      allSections.push(...sections);

      console.log(`✓ ${pageConfig.title} (${sections.length} sections)`);
    } catch (err) {
      console.error(`✗ Error processing ${pageConfig.title}:`, err.message);
    }
  }

  console.log(`\nTotal sections indexed: ${allSections.length}`);

  // Write index to file
  const indexPath = path.join(__dirname, 'assets', 'search-index.json');
  fs.writeFileSync(indexPath, JSON.stringify(allSections, null, 2));

  console.log(`✓ Search index written to ${indexPath}`);

  return allSections;
}

// Run if called directly
if (require.main === module) {
  try {
    buildSearchIndex();
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

module.exports = { buildSearchIndex };
