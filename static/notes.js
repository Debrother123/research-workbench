'use strict';
/* 研构 · 笔记面板（DEC-006 P2：查证联动）
 * 渲染 project.note_text，按标题分节；节点 ↔ 笔记小节双向高亮；obsidian:// 标题级跳转。
 * 依赖 app.js 的脚本级全局 state（经典脚本共享全局词法环境，可裸名访问）。
 * 映射表 project.note_anchors: {node_id: {heading, line_start, line_end, source}}。
 */
(function () {
  const $ = id => document.getElementById(id);
  let sections = [];      // {heading, level, start, el}
  let renderedKey = '';

  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const inline = s => esc(s)
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="md-wikilink">$1</span>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');

  /* obsidian://open?vault=...&file=...（vault 段按路径中含 vault 的目录识别；
   * 官方文档要求参数值整体 URI 编码——路径斜杠必须为 %2F，标题用 %23 拼接） */
  function obsidianBase() {
    const p = state.project;
    if (!p || !p.note_path) return null;
    const segs = p.note_path.replace(/\\/g, '/').split('/').filter(Boolean);
    const vi = segs.findIndex(s => /vault/i.test(s));
    if (vi < 0 || vi >= segs.length - 1) return null;
    const vault = segs[vi];
    const file = segs.slice(vi + 1).join('/').replace(/\.md$/i, '');
    return 'obsidian://open?vault=' + encodeURIComponent(vault) +
      '&file=' + encodeURIComponent(file);
  }
  /* 节点/小节 → obsidian:// 标题级深链；无 vault 路径时返回 null */
  window.obsidianLinkFor = heading => {
    const base = obsidianBase();
    return base ? base + '%23' + encodeURIComponent(heading) : null;
  };

  function nodeIdsFor(heading) {
    const p = state.project;
    return Object.entries((p && p.note_anchors) || {})
      .filter(([, a]) => a && a.heading === heading)
      .map(([id]) => id);
  }

  function showPanel() {
    const panel = $('note-panel'), rz = $('note-resizer');
    if (panel) panel.hidden = false;
    if (rz) rz.hidden = false;
  }

  function focusSection(heading) {
    const s = sections.find(x => x.heading === heading);
    if (!s) return;
    showPanel();
    sections.forEach(x => x.el.classList.toggle('active', x === s));
    document.querySelectorAll('.note-toc-item').forEach(b =>
      b.classList.toggle('active', b.textContent === heading));
    s.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* 暴露：画布选中节点 → 笔记滚动高亮 */
  window.notePanelNode = nodeId => {
    const p = state.project;
    const anchor = p && (p.note_anchors || {})[nodeId];
    if (anchor) focusSection(anchor.heading);
  };
  /* 暴露：检查器按钮 → 聚焦小节 */
  window.notePanelFocus = focusSection;

  function renderNotePanel() {
    const panel = $('note-panel');
    if (!panel) return;
    const p = (typeof state !== 'undefined') && state.project;
    const has = !!(p && p.note_text);
    if (!has) {
      panel.hidden = true;
      const rz0 = $('note-resizer'); if (rz0) rz0.hidden = true;
      const t0 = $('note-toggle'); if (t0) t0.disabled = true;
      sections = []; renderedKey = '';
      return;
    }
    const tgl = $('note-toggle'); if (tgl) tgl.disabled = false;
    const anchors = p.note_anchors || {};
    const key = p.id + '|' + p.revision + '|' + p.note_text.length + '|' + Object.keys(anchors).length + '|' + (p.note_path || '');
    if (key === renderedKey) return;
    renderedKey = key;
    showPanel();

    const doc = $('note-doc'), toc = $('note-toc');
    doc.replaceChildren(); toc.replaceChildren(); sections = [];
    const base = obsidianBase();
    const obs = $('note-obsidian');
    if (base) {
      obs.href = base; obs.classList.remove('disabled'); obs.title = p.note_path;
    } else {
      obs.removeAttribute('href'); obs.classList.add('disabled');
      obs.title = 'note_path 未指向 Obsidian 仓库路径，无法生成跳转链接';
    }

    const lines = p.note_text.split('\n');
    let i = 0;
    // frontmatter 折叠展示
    if ((lines[0] || '').trim() === '---') {
      const end = lines.findIndex((l, idx) => idx > 0 && l.trim() === '---');
      if (end > 0) {
        const det = document.createElement('details');
        det.className = 'md-front';
        const sum = document.createElement('summary');
        sum.textContent = '笔记元信息（frontmatter）';
        const pre = document.createElement('pre');
        pre.textContent = lines.slice(1, end).join('\n');
        det.append(sum, pre); doc.append(det);
        i = end + 1;
      }
    }

    let cur = null; // 当前小节容器
    const host = () => (cur ? cur.el : doc);

    function newSection(level, text, lineNo) {
      cur = { heading: text, level, start: lineNo, el: document.createElement('section') };
      cur.el.className = 'note-sec lv' + level;
      const h = document.createElement(level <= 2 ? 'h3' : 'h4');
      h.className = 'note-head';
      const t = document.createElement('span');
      t.className = 'note-head-text'; t.textContent = text;
      h.append(t);
      const mapped = nodeIdsFor(text);
      if (mapped.length) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'note-link-btn';
        b.textContent = '图 ×' + mapped.length;
        b.title = '在画布上定位本小节对应的模块';
        b.onclick = () => window.rwRevealNodes && window.rwRevealNodes(mapped);
        h.append(b);
      }
      if (base) {
        const a = document.createElement('a');
        a.className = 'note-obs-link'; a.textContent = '↗';
        a.title = '在 Obsidian 中打开本小节（跳转到对应标题）';
        a.href = window.obsidianLinkFor(text);
        h.append(a);
      }
      cur.el.append(h);
      doc.append(cur.el);
      sections.push(cur);
      const tb = document.createElement('button');
      tb.type = 'button';
      tb.className = 'note-toc-item lv' + level;
      tb.textContent = text;
      tb.onclick = () => focusSection(text);
      toc.append(tb);
    }

    // 行级解析：标题 / 表格 / 列表 / 引用 / $$ 公式块 / 段落
    let listEl = null, tableRows = null, bqEl = null, mathBuf = null, inMath = false, parBuf = [];
    const flushList = () => { if (listEl) { host().append(listEl); listEl = null; } };
    const flushBq = () => { if (bqEl) { host().append(bqEl); bqEl = null; } };
    const flushPar = () => {
      if (parBuf.length) {
        const pe = document.createElement('p');
        pe.innerHTML = parBuf.map(inline).join('<br>');
        host().append(pe); parBuf = [];
      }
    };
    const flushTable = () => {
      if (!tableRows) return;
      const rows = tableRows
        .map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
        .filter(cells => !cells.every(c => /^:?-{2,}:?$/.test(c)));
      if (rows.length) {
        const tb = document.createElement('table');
        rows.forEach((cells, ri) => {
          const tr = document.createElement('tr');
          cells.forEach(c => {
            const td = document.createElement(ri === 0 ? 'th' : 'td');
            td.innerHTML = inline(c); tr.append(td);
          });
          tb.append(tr);
        });
        host().append(tb);
      }
      tableRows = null;
    };
    const flushAll = () => { flushList(); flushBq(); flushPar(); flushTable(); };

    for (let ln = i; ln < lines.length; ln++) {
      const raw = lines[ln];
      const line = raw.replace(/\s+$/, '');
      if (inMath) {
        if (/^\$\$\s*$/.test(line)) {
          const pre = document.createElement('pre');
          pre.className = 'md-math';
          pre.textContent = mathBuf.join('\n');
          host().append(pre);
          mathBuf = null; inMath = false;
        } else mathBuf.push(raw);
        continue;
      }
      const hm = line.match(/^(#{1,4})\s+(.*)$/);
      if (hm) { flushAll(); newSection(hm[1].length, hm[2].trim(), ln + 1); continue; }
      if (/^\$\$\s*$/.test(line)) { flushAll(); inMath = true; mathBuf = []; continue; }
      if (/^\s*\|.*\|\s*$/.test(line)) {
        flushList(); flushBq(); flushPar();
        tableRows = tableRows || []; tableRows.push(line); continue;
      }
      flushTable();
      const ol = line.match(/^\s*\d+\.\s+(.*)$/);
      const ul = line.match(/^\s*[-*]\s+(.*)$/);
      if (ol || ul) {
        flushBq(); flushPar();
        if (!listEl || (ol && listEl.tagName !== 'OL') || (ul && listEl.tagName !== 'UL')) {
          flushList();
          listEl = document.createElement(ol ? 'ol' : 'ul');
        }
        const li = document.createElement('li');
        li.innerHTML = inline((ol || ul)[1]);
        listEl.append(li);
        continue;
      }
      flushList();
      const qm = line.match(/^\s*>\s?(.*)$/);
      if (qm) {
        flushPar();
        if (!bqEl) { bqEl = document.createElement('blockquote'); }
        const span = document.createElement('span');
        span.innerHTML = inline(qm[1]);
        bqEl.append(span);
        continue;
      }
      flushBq();
      if (!line.trim()) { flushPar(); continue; }
      parBuf.push(line);
    }
    flushAll();
  }

  window.renderNotePanel = renderNotePanel;

  // 面板显隐开关（工具栏按钮 + 面板头部收起按钮）
  document.addEventListener('DOMContentLoaded', () => {
    const tgl = $('note-toggle'), col = $('note-collapse');
    if (tgl) tgl.onclick = () => showPanel();
    if (col) col.onclick = () => {
      const panel = $('note-panel'), rz = $('note-resizer');
      if (panel) panel.hidden = true;
      if (rz) rz.hidden = true;
    };
  });
})();
