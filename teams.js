/* Tiny chart renderer. Reads /data/teams.json. No libraries.
   Solid line: reports to. Dashed line: escalation path (who receives the
   decision past the limit). Tables render only when team.sample is true. */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var FREE = {
    'sales-director': 1, 'sales-executive': 1, 'customer-success-manager': 1,
    'product-manager': 1, 'project-manager': 1, 'engineering-manager': 1,
    'software-engineer': 1, 'hr-business-partner': 1, 'marketing-manager': 1
  };

  function label(role) {
    if (role.sectorTitle) return role.sectorTitle;
    if (role.overrides && role.overrides.title) return role.overrides.title;
    return role.title;
  }
  function managerId(role) {
    if (role.overrides && role.overrides.reportsTo) return role.overrides.reportsTo;
    return role.reportsTo || null;
  }
  function escalations(role) {
    if (role.overrides && role.overrides.escalatesTo) return role.overrides.escalatesTo;
    return role.escalatesTo || [];
  }
  function el(name, attrs) {
    var node = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (key) {
      if (attrs[key] != null) node.setAttribute(key, String(attrs[key]));
    });
    return node;
  }
  function wrap(text, max) {
    var words = String(text).split(' ');
    var lines = [];
    var cur = '';
    words.forEach(function (word) {
      var next = cur ? cur + ' ' + word : word;
      if (next.length > max && cur) { lines.push(cur); cur = word; }
      else cur = next;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function byId(team) {
    var map = {};
    team.roles.forEach(function (role) { map[role.id] = role; });
    return map;
  }

  function layout(team) {
    var children = {};
    team.roles.forEach(function (role) { children[role.id] = []; });
    team.roles.forEach(function (role) {
      var manager = managerId(role);
      if (manager && children[manager]) children[manager].push(role.id);
    });
    var NW = 176, NH = 58, GX = 18, GY = 72;
    function widthOf(id) {
      var kids = children[id];
      if (!kids.length) return NW;
      var sum = 0;
      kids.forEach(function (kid, i) { sum += widthOf(kid) + (i ? GX : 0); });
      return Math.max(NW, sum);
    }
    var pos = {};
    function place(id, left, top) {
      var span = widthOf(id);
      pos[id] = { x: left + (span - NW) / 2, y: top, w: NW, h: NH };
      var x = left;
      children[id].forEach(function (kid) {
        var w = widthOf(kid);
        place(kid, x, top + NH + GY);
        x += w + GX;
      });
    }
    var roots = team.roles.filter(function (role) {
      return !managerId(role) && children[role.id].length;
    });
    var x = 24;
    roots.forEach(function (role) {
      var span = widthOf(role.id);
      place(role.id, x, 24);
      x += span + GX * 2;
    });
    var railX = x + 12;
    var railY = 24;
    team.roles.forEach(function (role) {
      if (!pos[role.id]) {
        pos[role.id] = { x: railX, y: railY, w: NW, h: NH, rail: true };
        railY += NH + 14;
      }
    });
    var width = 48, height = 48;
    Object.keys(pos).forEach(function (id) {
      width = Math.max(width, pos[id].x + pos[id].w + 24);
      height = Math.max(height, pos[id].y + pos[id].h + 24);
    });
    return { pos: pos, children: children, width: width, height: height, GY: GY };
  }

  function marker(id) {
    var m = el('marker', {
      id: id, viewBox: '0 0 10 10', refX: '9', refY: '5',
      markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse'
    });
    m.appendChild(el('path', { d: 'M 0 1.2 L 9 5 L 0 8.8 Z', fill: '#1d4ed8' }));
    return m;
  }

  function describe(team) {
    var names = byId(team);
    var bits = [];
    team.roles.forEach(function (role) {
      var manager = managerId(role);
      if (manager && names[manager]) bits.push(label(role) + ' reports to ' + label(names[manager]));
    });
    team.roles.forEach(function (role) {
      escalations(role).forEach(function (target) {
        if (names[target]) bits.push(label(role) + ' escalates to ' + label(names[target]));
      });
    });
    return bits.join('. ') + '.';
  }

  function lockAt(x, y) {
    var g = el('g', { 'aria-hidden': 'true', transform: 'translate(' + x + ' ' + y + ')' });
    g.appendChild(el('rect', {
      x: '0.6', y: '4.2', width: '8.8', height: '6.2', rx: '0.8',
      fill: 'none', stroke: '#64748b', 'stroke-width': '1.2'
    }));
    g.appendChild(el('path', {
      d: 'M2.4 4.2V3.1a2.6 2.6 0 0 1 5.2 0V4.2',
      fill: 'none', stroke: '#64748b', 'stroke-width': '1.2'
    }));
    return g;
  }

  function drawNode(role, box, team) {
    var lines = wrap(label(role), 20);
    var names = byId(team);
    var aria = label(role);
    if (role.kind === 'context') aria += '. Not a role in this pack.';
    else if (role.kind === 'paid') aria += '. In the full library.';
    else aria += '. Open the spec.';
    if (role.note) aria += ' ' + role.note + '.';
    var manager = managerId(role);
    if (manager && names[manager]) aria += ' Reports to ' + label(names[manager]) + '.';

    var node;
    if (role.kind === 'free') node = el('a', { class: 'org-node', href: '/role-library#' + role.id });
    else if (role.kind === 'paid') node = el('a', { class: 'org-node', href: '#' + team.id + '-detail' });
    else node = el('g', { class: 'org-node', tabindex: '0', role: 'group' });
    node.setAttribute('aria-label', aria);
    var tip = el('title');
    tip.textContent = aria;
    node.appendChild(tip);

    var context = role.kind === 'context';
    node.appendChild(el('rect', {
      x: box.x, y: box.y, width: box.w, height: box.h, rx: '2',
      fill: context ? '#f9fafb' : '#ffffff',
      stroke: context ? '#cbd5e1' : '#1d4ed8',
      'stroke-width': '1.25'
    }));
    var tx = box.x + box.w / 2 - (role.kind === 'paid' ? 6 : 0);
    var text = el('text', {
      x: tx,
      y: box.y + box.h / 2 - (lines.length - 1) * 7.5 + 4,
      'text-anchor': 'middle',
      fill: context ? '#374151' : '#0d0d0d',
      'font-family': 'DM Sans, sans-serif',
      'font-size': '12.5'
    });
    lines.forEach(function (line, i) {
      var span = el('tspan', { x: tx, dy: i ? 15 : 0 });
      span.textContent = line;
      text.appendChild(span);
    });
    node.appendChild(text);
    if (role.kind === 'paid') node.appendChild(lockAt(box.x + box.w - 16, box.y + 6));
    if (role.kind === 'paid') {
      node.addEventListener('click', function (event) {
        event.preventDefault();
        showDetail(team, role);
      });
    }
    return node;
  }

  function showDetail(team, role) {
    var box = document.getElementById(team.id + '-detail');
    if (!box) return;
    box.hidden = false;
    var heading = box.querySelector('h3');
    heading.textContent = label(role);
    box.querySelector('.role-pop-line').textContent = role.line || '';
    heading.focus();
  }

  function drawChart(team) {
    var lay = layout(team);
    var names = byId(team);
    var svg = el('svg', {
      viewBox: '0 0 ' + lay.width + ' ' + lay.height,
      width: lay.width,
      height: lay.height,
      role: 'group',
      'aria-labelledby': team.id + '-svg-title',
      'aria-describedby': team.id + '-svg-desc'
    });
    var title = el('title', { id: team.id + '-svg-title' });
    title.textContent = team.title + '. Reporting lines are solid. Escalation paths are dashed.';
    var desc = el('desc', { id: team.id + '-svg-desc' });
    desc.textContent = describe(team);
    svg.appendChild(title);
    svg.appendChild(desc);
    var style = el('style');
    style.textContent = '.org-node:focus{outline:none}.org-node:focus rect,.org-node:focus-visible rect{stroke:#1e3a8a;stroke-width:2.5}a.org-node:hover rect{fill:#eff6ff}';
    svg.appendChild(style);
    var defs = el('defs');
    defs.appendChild(marker(team.id + '-arrow'));
    svg.appendChild(defs);

    var edges = el('g', { fill: 'none', stroke: '#1d4ed8', 'stroke-width': '1.5' });
    Object.keys(lay.children).forEach(function (parentId) {
      var kids = lay.children[parentId];
      if (!kids.length) return;
      var parent = lay.pos[parentId];
      var px = parent.x + parent.w / 2;
      var py = parent.y + parent.h;
      var bus = py + 34;
      var xs = kids.map(function (id) { return lay.pos[id].x + lay.pos[id].w / 2; });
      var min = Math.min.apply(null, xs.concat([px]));
      var max = Math.max.apply(null, xs.concat([px]));
      edges.appendChild(el('path', { d: 'M ' + px + ' ' + py + ' V ' + bus }));
      if (max !== min) edges.appendChild(el('path', { d: 'M ' + min + ' ' + bus + ' H ' + max }));
      kids.forEach(function (id) {
        var child = lay.pos[id];
        var cx = child.x + child.w / 2;
        edges.appendChild(el('path', {
          d: 'M ' + cx + ' ' + bus + ' V ' + (child.y - 1),
          'marker-end': 'url(#' + team.id + '-arrow)'
        }));
      });
    });
    team.roles.forEach(function (role) {
      escalations(role).forEach(function (targetId) {
        var from = lay.pos[role.id];
        var to = lay.pos[targetId];
        if (!from || !to || !names[targetId]) return;
        var path;
        if (managerId(role) === targetId) {
          var x = from.x + from.w / 2 + 10;
          path = el('path', {
            d: 'M ' + x + ' ' + from.y + ' V ' + (from.y - 26),
            'stroke-dasharray': '4 3',
            'marker-end': 'url(#' + team.id + '-arrow)'
          });
        } else {
          var x1 = from.x + from.w;
          var y1 = from.y + from.h / 2;
          var x2 = to.x;
          var y2 = to.y + to.h / 2;
          if (to.x + to.w < from.x) { x1 = from.x; x2 = to.x + to.w; }
          var bend = x2 >= x1 ? 40 : -40;
          path = el('path', {
            d: 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + bend) + ' ' + y1 + ', ' + (x2 - bend) + ' ' + y2 + ', ' + (x2 - (bend > 0 ? 2 : -2)) + ' ' + y2,
            'stroke-dasharray': '4 3',
            'marker-end': 'url(#' + team.id + '-arrow)'
          });
        }
        var edgeTitle = el('title');
        edgeTitle.textContent = label(role) + ' escalates to ' + label(names[targetId]);
        path.appendChild(edgeTitle);
        edges.appendChild(path);
      });
    });
    svg.appendChild(edges);
    team.roles.forEach(function (role) {
      svg.appendChild(drawNode(role, lay.pos[role.id], team));
    });
    return svg;
  }

  function table(caption, headers, rows, keys) {
    var tableEl = document.createElement('table');
    tableEl.className = 'team-table';
    var cap = document.createElement('caption');
    cap.textContent = caption;
    tableEl.appendChild(cap);
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    headers.forEach(function (header) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.textContent = header;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    tableEl.appendChild(thead);
    var body = document.createElement('tbody');
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      keys.forEach(function (key) {
        var td = document.createElement('td');
        td.textContent = row[key];
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    tableEl.appendChild(body);
    var wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    wrap.appendChild(tableEl);
    return wrap;
  }

  function sectionFor(team) {
    var section = document.createElement('section');
    section.id = team.id;
    var heading = document.createElement('h2');
    heading.className = 'sec';
    heading.textContent = team.title;
    section.appendChild(heading);
    var intro = document.createElement('p');
    intro.className = 'sec-intro';
    if (team.sample) {
      intro.textContent = 'The free sample. The chart, the escalation table, and the handoff table are on this page.';
    } else {
      intro.innerHTML = 'Titles and lines. The escalation and handoff tables are in the <a href="/full-library">full library</a>.';
    }
    section.appendChild(intro);
    var scroll = document.createElement('div');
    scroll.className = 'org-scroll';
    scroll.appendChild(drawChart(team));
    section.appendChild(scroll);
    var legend = document.createElement('p');
    legend.className = 'org-legend';
    legend.innerHTML = '<span class="leg-solid" aria-hidden="true"></span> Reports to <span class="leg-dash" aria-hidden="true"></span> Escalates past a limit';
    section.appendChild(legend);
    if (team.note) {
      var note = document.createElement('p');
      note.className = 'sec-intro';
      note.textContent = team.note;
      section.appendChild(note);
    }
    var pop = document.createElement('div');
    pop.className = 'role-pop';
    pop.id = team.id + '-detail';
    pop.hidden = true;
    pop.innerHTML = '<h3 tabindex="-1"></h3><p class="role-pop-line"></p><p class="quiet-cta"><a href="/full-library">Get the full library →</a></p>';
    section.appendChild(pop);
    if (team.sample && team.escalationTable && team.handoffs) {
      section.appendChild(table('Escalation', ['Role', 'Decision', 'Limit', 'Goes to'], team.escalationTable, ['role', 'decision', 'limit', 'to']));
      section.appendChild(table('Handoffs', ['From', 'Deliverable', 'To', 'When'], team.handoffs, ['from', 'deliverable', 'to', 'when']));
      if (team.gap) {
        var gap = document.createElement('p');
        gap.className = 'sec-intro';
        gap.textContent = team.gap;
        section.appendChild(gap);
      }
    }
    return section;
  }

  function mountTeams(host, sector) {
    host.innerHTML = '';
    sector.teams.forEach(function (team) {
      var safe = {
        id: team.id,
        title: team.title,
        sample: !!team.sample,
        note: team.note || '',
        gap: team.sample ? team.gap : '',
        roles: team.roles,
        escalationTable: team.sample ? team.escalationTable : null,
        handoffs: team.sample ? team.handoffs : null
      };
      host.appendChild(sectionFor(safe));
    });
  }

  function teamSlug(data, title) {
    var found = '';
    data.sectors[0].teams.forEach(function (team) {
      if (team.title === title) found = team.id;
    });
    return found;
  }

  function connectNode(id, title, teamTitle, x, y, data) {
    var href = FREE[id] ? '/role-library#' + id : '/teams#' + teamSlug(data, teamTitle);
    var node = el('a', { class: 'org-node', href: href });
    var aria = title + ', ' + teamTitle + (FREE[id] ? '. Open the spec.' : '. In the full library.');
    node.setAttribute('aria-label', aria);
    var tip = el('title');
    tip.textContent = aria;
    node.appendChild(tip);
    node.appendChild(el('rect', {
      x: x, y: y, width: 210, height: 64, rx: '2', fill: '#ffffff', stroke: '#1d4ed8', 'stroke-width': '1.25'
    }));
    var lines = wrap(title, 22);
    var text = el('text', {
      x: x + 105, y: y + (lines.length > 1 ? 26 : 36),
      'text-anchor': 'middle', fill: '#0d0d0d',
      'font-family': 'DM Sans, sans-serif', 'font-size': '13'
    });
    lines.forEach(function (line, i) {
      var span = el('tspan', { x: x + 105, dy: i ? 15 : 0 });
      span.textContent = line;
      text.appendChild(span);
    });
    node.appendChild(text);
    if (!FREE[id]) node.appendChild(lockAt(x + 192, y + 5));
    return node;
  }

  function mountConnect(host, data) {
    var rows = data.crossTeam || [];
    var W = 760;
    var rowH = 112;
    var H = rows.length * rowH + 8;
    var svg = el('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      width: W,
      height: H,
      role: 'group',
      'aria-labelledby': 'connect-title',
      'aria-describedby': 'connect-desc'
    });
    var title = el('title', { id: 'connect-title' });
    title.textContent = 'How the teams connect';
    var desc = el('desc', { id: 'connect-desc' });
    desc.textContent = rows.map(function (row) {
      return row.fromTitle + ' (' + row.fromTeam + ') to ' + row.toTitle + ' (' + row.toTeam + '): ' + row.deliverable + ', ' + row.when;
    }).join('. ') + '.';
    svg.appendChild(title);
    svg.appendChild(desc);
    var style = el('style');
    style.textContent = 'a.org-node:focus{outline:none}a.org-node:focus rect,a.org-node:focus-visible rect{stroke:#1e3a8a;stroke-width:2.5}a.org-node:hover rect{fill:#eff6ff}';
    svg.appendChild(style);
    var defs = el('defs');
    defs.appendChild(marker('connect-arrow'));
    svg.appendChild(defs);
    rows.forEach(function (row, index) {
      var y = 8 + index * rowH;
      svg.appendChild(connectNode(row.fromId, row.fromTitle, row.fromTeam, 8, y, data));
      svg.appendChild(connectNode(row.toId, row.toTitle, row.toTeam, W - 218, y, data));
      var mid = wrap(row.deliverable, 26);
      var label = el('text', {
        x: W / 2, y: y + 18,
        'text-anchor': 'middle', fill: '#1d4ed8',
        'font-family': 'DM Sans, sans-serif', 'font-size': '12'
      });
      mid.forEach(function (line, i) {
        var span = el('tspan', { x: W / 2, dy: i ? 14 : 0 });
        span.textContent = line;
        label.appendChild(span);
      });
      svg.appendChild(label);
      var arrowY = y + 52;
      svg.appendChild(el('path', {
        d: 'M 226 ' + arrowY + ' H 530',
        fill: 'none', stroke: '#1d4ed8', 'stroke-width': '1.5',
        'marker-end': 'url(#connect-arrow)'
      }));
      var when = el('text', {
        x: W / 2, y: arrowY + 16,
        'text-anchor': 'middle', fill: '#374151',
        'font-family': 'DM Sans, sans-serif', 'font-size': '11'
      });
      when.textContent = row.when;
      svg.appendChild(when);
    });
    host.innerHTML = '';
    host.classList.add('visible');
    var scroll = document.createElement('div');
    scroll.className = 'org-scroll';
    scroll.appendChild(svg);
    host.appendChild(scroll);
  }

  function boot(data) {
    var charts = document.getElementById('team-charts');
    var connect = document.getElementById('team-connect');
    var select = document.getElementById('sector');
    function sectorById(id) {
      for (var i = 0; i < data.sectors.length; i++) if (data.sectors[i].id === id) return data.sectors[i];
      return data.sectors[0];
    }
    if (charts) {
      if (select) {
        select.innerHTML = '';
        data.sectors.forEach(function (sector) {
          var option = document.createElement('option');
          option.value = sector.id;
          option.textContent = sector.title;
          select.appendChild(option);
        });
        select.disabled = data.sectors.length < 2;
        select.addEventListener('change', function () { mountTeams(charts, sectorById(select.value)); });
      }
      mountTeams(charts, sectorById(select ? select.value : data.sectors[0].id));
    }
    if (connect) mountConnect(connect, data);
  }

  function start() {
    if (!document.getElementById('team-charts') && !document.getElementById('team-connect')) return;
    fetch('/data/teams.json').then(function (response) {
      if (!response.ok) throw new Error('teams');
      return response.json();
    }).then(boot).catch(function () {
      var charts = document.getElementById('team-charts');
      var connect = document.getElementById('team-connect');
      if (charts) charts.textContent = 'The team charts could not be loaded.';
      if (connect) connect.textContent = 'The team diagram could not be loaded.';
    });
  }

  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);
})();
