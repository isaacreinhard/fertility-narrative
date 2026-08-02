/* The Great Descent — a six-scene narrative visualization of the world's
   total fertility rate, 1960–2024.  Martini-glass structure: five authored
   scenes in which the mouse does nothing at all, then free exploration.

   Everything is drawn once and restyled between scenes; nothing is ever
   cleared and rebuilt.  Scene 4's y-axis zoom is a vertical transform on the
   (clipped) plot group, so no path geometry is regenerated mid-animation. */

(function () {
  'use strict';

  /* ---------------------------------------------------------------- setup */

  // Earth palette: pigments rather than screen colours. Must stay in step with
  // the custom properties in css/style.css.
  var COL = {
    bg:    '#f4ece0',   // parchment
    ink:   '#3a2f26',   // warm dark brown (world line)
    faint: '#c2b3a0',   // the country tangle
    water: '#9c4a34',   // clay
    muted: '#7d6d5d',
    CHN:   '#b5502f',   // rust
    IRN:   '#357a6b',   // pine
    BGD:   '#b4841f',   // ochre
    KOR:   '#3f6491',   // faded denim
    JPN:   '#8d6280',   // mauve
    ITA:   '#61784f',   // olive
    NER:   '#c06a26',   // burnt orange
    SSF:   '#7a4560'    // plum
  };

  var VB = { w: 960, h: 540 };
  var M  = { top: 34, right: 152, bottom: 34, left: 44 };
  var PLOT = {
    left:   M.left,
    right:  VB.w - M.right,
    top:    M.top,
    bottom: VB.h - M.bottom
  };
  PLOT.w = PLOT.right - PLOT.left;
  PLOT.h = PLOT.bottom - PLOT.top;

  var Y_FULL = 8.9;          // covers the series maximum (Yemen, 1985 = 8.864)
  var Y_ZOOM = 3.2;          // scene 4
  var REPLACEMENT = 2.1;
  var YEAR0 = 1960, YEAR1 = 2024;

  var DUR = 750;             // scene transition
  var NOTE_FADE = 420;
  var NOTE_DELAY = DUR + 90; // notes appear once the movement has settled

  var f1 = d3.format('.1f');
  var f2 = d3.format('.2f');

  var x = d3.scaleLinear().domain([YEAR0, YEAR1]).range([PLOT.left, PLOT.right]);
  // The y scale never changes: the scene-4 zoom is a transform, so every path's
  // "d" attribute is generated exactly once, for the life of the page.
  var y = d3.scaleLinear().domain([0, Y_FULL]).range([PLOT.bottom, PLOT.top]);
  var yAxisScale = d3.scaleLinear().domain([0, Y_FULL]).range([PLOT.bottom, PLOT.top]);

  var zoomK = 1;             // 1 = full view, Y_FULL/Y_ZOOM = scene 4

  function pixOf(v, k) {     // pixel position of a value at zoom factor k
    if (k === undefined) k = zoomK;
    return PLOT.bottom + (y(v) - PLOT.bottom) * k;
  }
  function zoomTransform(k) {
    return 'translate(0,' + (PLOT.bottom * (1 - k)) + ') scale(1,' + k + ')';
  }

  /* --------------------------------------------------------------- layers */

  var svg = d3.select('#chart');

  var defs = svg.append('defs');
  defs.append('clipPath').attr('id', 'plot-clip')
     .append('rect')
       .attr('x', PLOT.left - 1).attr('y', PLOT.top - 1)
       .attr('width', PLOT.w + 2).attr('height', PLOT.h + 2);
  // The axis keeps the full width (its labels live in the left margin) but is
  // bounded vertically: when the domain changes, d3-axis animates the ticks it
  // is dropping towards their position under the NEW scale, which for 4..8
  // during scene 4's zoom is hundreds of pixels above the chart.
  defs.append('clipPath').attr('id', 'axis-clip')
     .append('rect')
       .attr('x', 0).attr('y', PLOT.top - 8)
       .attr('width', VB.w).attr('height', PLOT.h + 16);

  var gGrid  = svg.append('g').attr('clip-path', 'url(#axis-clip)')
                  .append('g').attr('class', 'grid')
                  .attr('transform', 'translate(' + PLOT.left + ',0)');
  var gXAxis = svg.append('g').attr('class', 'x-axis')
                  .attr('transform', 'translate(0,' + PLOT.bottom + ')');

  var gClip = svg.append('g').attr('clip-path', 'url(#plot-clip)');
  var gZoom = gClip.append('g').attr('class', 'zoom-layer')
                   .attr('transform', zoomTransform(1));

  var tintRect = gZoom.append('rect').attr('class', 'waterline-tint')
      .attr('x', PLOT.left)
      .attr('y', y(REPLACEMENT))
      .attr('width', PLOT.w)
      .attr('height', PLOT.bottom - y(REPLACEMENT))
      .attr('opacity', 0);

  var gLines    = gZoom.append('g');   // the gray tangle
  var gWorld    = gZoom.append('g');   // the world average
  var waterLine = gZoom.append('line').attr('class', 'waterline')
      .attr('x1', PLOT.left).attr('x2', PLOT.right)
      .attr('y1', y(REPLACEMENT)).attr('y2', y(REPLACEMENT))
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('opacity', 0);
  var gFeatured = gZoom.append('g');   // featured / pinned / hovered lines

  var gOverlay = svg.append('g');      // unclipped, unzoomed text furniture
  // Just past the right end of the dashed line, in the margin where no line is
  // ever drawn — inside the plot its halo would eat a gap out of whichever line
  // ends beside it.  updateLabels() owns its y and keeps country name labels
  // from colliding with it.
  var waterLabel = gOverlay.append('text').attr('class', 'waterline-label')
      .attr('x', PLOT.right + 7)
      .attr('y', y(REPLACEMENT) + 3.5)
      .attr('opacity', 0)
      .text('replacement ≈2.1');
  var zoomBadge = gOverlay.append('text').attr('class', 'zoom-badge')
      .attr('x', PLOT.left + 8)
      .attr('y', PLOT.top + 15)
      .attr('opacity', 0)
      .text('y-axis zoomed · 0–3.2 births per woman');
  gOverlay.append('text').attr('class', 'axis-caption')
      .attr('x', 0).attr('y', 15)
      .text('births per woman');
  var gLabels = gOverlay.append('g');

  var gNotes = svg.append('g').attr('class', 'notes').style('opacity', 0);

  var hit = svg.append('rect')
      .attr('x', PLOT.left).attr('y', PLOT.top)
      .attr('width', PLOT.w).attr('height', PLOT.h)
      .attr('fill', 'none')
      .style('pointer-events', 'none');

  /* ------------------------------------------------------------- the axes */

  gXAxis.call(d3.axisBottom(x).tickValues([1960, 1970, 1980, 1990, 2000, 2010, 2020, 2024])
                              .tickFormat(d3.format('d')).tickSizeOuter(0));

  function yAxisFor(domainMax) {
    var step = domainMax > 5 ? 1 : 0.5;
    var vals = d3.range(0, domainMax + 1e-9, step);
    return d3.axisLeft(yAxisScale)
             .tickValues(vals)
             .tickSize(-PLOT.w)
             .tickPadding(7)
             .tickFormat(domainMax > 5 ? d3.format('d') : d3.format('.1f'));
  }
  function applyYAxis(domainMax, dur) {
    yAxisScale.domain([0, domainMax]);
    var ax = yAxisFor(domainMax);
    if (dur > 0) gGrid.transition('yaxis').duration(dur).ease(d3.easeCubicInOut).call(ax);
    else gGrid.interrupt('yaxis').call(ax);
  }
  applyYAxis(Y_FULL, 0);

  /* ------------------------------------------------------------ page bits */

  var el = {
    heading:  document.getElementById('scene-heading'),
    subtitle: document.getElementById('scene-subtitle'),
    head:     document.querySelector('.scene-head'),
    back:     document.getElementById('back'),
    next:     document.getElementById('next'),
    counter:  document.getElementById('counter'),
    dots:     document.getElementById('dots'),
    explore:  document.getElementById('explore'),
    search:   document.getElementById('search'),
    datalist: document.getElementById('country-list'),
    reset:    document.getElementById('reset'),
    tooltip:  document.getElementById('tooltip'),
    wrap:     document.getElementById('chart-wrap')
  };

  /* ------------------------------------------------------------ load data */

  d3.csv('data/fertility.csv', function (d) {
    // A blank cell is missing data, never zero.
    if (d.tfr === undefined || d.tfr === null || String(d.tfr).trim() === '') return null;
    var v = +d.tfr;
    if (!isFinite(v)) return null;
    var yr = +d.year;
    if (!isFinite(yr)) return null;
    return { code: d.code, name: d.name, region: d.region, year: yr, tfr: v };
  }).then(start).catch(function (err) {
    d3.select('#chart-wrap').append('p')
      .style('color', COL.water).style('font-size', '13px')
      .text('Could not load data/fertility.csv — serve this folder over http (python3 -m http.server 8000). ' + err);
  });

  /* ------------------------------------------------------------ the story */

  var series = [], byCode = {};
  var scenes = [];
  var current = 0, sceneToken = 0, noteTimer = null, armTimer = null;
  var front = {};                                   // code -> in gFeatured

  // scene-6 exploration state (never allowed to touch scenes 1–5)
  var pinned = null, hovered = null;

  function start(rows) {
    build(rows);
    scenes = defineScenes();
    buildChrome();
    wireControls();
    goTo(0, true);
  }

  function build(rows) {
    var groups = d3.group(rows, function (r) { return r.code; });

    groups.forEach(function (rs, code) {
      rs.sort(function (a, b) { return a.year - b.year; });
      var byYear = new Map();
      rs.forEach(function (r) { byYear.set(r.year, r.tfr); });

      // Rebuild the full year span with explicit nulls, so a country with a
      // hole in the middle (Luxembourg: 1961, 1963) gets a real gap in its
      // line rather than a straight bridge across the missing years.
      var y0 = rs[0].year, y1 = rs[rs.length - 1].year, pts = [];
      for (var yr = y0; yr <= y1; yr++) {
        pts.push({ year: yr, tfr: byYear.has(yr) ? byYear.get(yr) : null });
      }

      var s = {
        code: code,
        name: rs[0].name,
        region: rs[0].region,
        points: pts,
        byYear: byYear,
        lastYear: y1,
        lastValue: byYear.get(y1),
        isAggregate: rs[0].region === 'Aggregate'
      };
      series.push(s);
      byCode[code] = s;
    });

    series.sort(function (a, b) { return d3.ascending(a.name, b.name); });

    // Monotone cubic: softens the joins between years without inventing peaks
    // or troughs — it passes through every point and never overshoots, so
    // China's 1963 spike stays exactly as sharp as the data says it is.
    var line = d3.line()
      .curve(d3.curveMonotoneX)
      .defined(function (p) { return p.tfr !== null; })
      .x(function (p) { return x(p.year); })
      .y(function (p) { return y(p.tfr); });

    // One path per series, created once, geometry never regenerated.
    series.forEach(function (s) {
      var parent = s.code === 'WLD' ? gWorld : gLines;
      s.path = parent.append('path')
        .attr('d', line(s.points))
        .attr('fill', 'none')
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', 'round')
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('stroke', COL.faint)
        .attr('stroke-width', 1)
        .attr('opacity', 0.34);
    });
  }

  function val(code, year) {
    var s = byCode[code];
    var v = s && s.byYear.get(year);
    return (v === undefined || v === null) ? NaN : v;
  }
  function v1(code, year) { return f1(val(code, year)); }
  function v2(code, year) { return f2(val(code, year)); }

  /* Every number below is read out of the CSV at run time, so the prose can
     never drift from the data it describes. */
  function defineScenes() {
    return [
      {
        heading: 'It started with big families',
        subtitle: 'Almost everywhere you looked in 1960, four or more children was ordinary.',
        featured: [], world: 1, water: false, zoom: false,
        notes: [
          { code: 'WLD', year: 1960, dx: 118, dy: -60, align: 'left', wrap: 200,
            title: 'World average: ' + v1('WLD', 1960),
            text: 'Only 37 countries were below three, and all but two of them were in Europe.' }
        ]
      },
      {
        heading: 'Then it fell, nearly everywhere',
        subtitle: 'Sixty years on the average woman has fewer than half as many children. ' +
                  'Family size has never moved this far this fast.',
        featured: [], world: 1, water: true, zoom: false,
        notes: [
          { code: 'WLD', year: 2024, dx: -150, dy: -96, align: 'right', wrap: 176,
            title: v1('WLD', 2024) + ' in 2024',
            text: 'The world now sits barely above the line where a population holds steady.' },
          { value: REPLACEMENT, year: 1974, dx: 16, dy: 42, align: 'left', wrap: 236,
            title: 'The 2.1 line',
            text: 'Below this, each generation comes out smaller than the one before it.' }
        ]
      },
      {
        heading: 'Everyone got there differently',
        subtitle: 'China, Iran and Bangladesh all ended up near two. Almost nothing else ' +
                  'about how they got there was alike.',
        featured: [
          { code: 'CHN', color: COL.CHN },
          { code: 'IRN', color: COL.IRN },
          { code: 'BGD', color: COL.BGD }
        ],
        world: 0.5, water: true, zoom: false,
        notes: [
          { code: 'CHN', year: 1963, dx: 86, dy: -28, align: 'left', wrap: 186,
            title: "China's spike",
            text: 'Births collapsed through the famine years, then rebounded to ' +
                  v1('CHN', 1963) + ' in 1963.' },
          { code: 'CHN', year: 1979, dx: -64, dy: 74, align: 'left', wrap: 190,
            title: 'Before the policy',
            text: "China's steepest fall came in the 1970s, years before the one-child " +
                  'policy arrived in 1980.' },
          { code: 'IRN', year: 1988, dx: 66, dy: -74, align: 'left', wrap: 194,
            title: 'Iran, in fifteen years',
            text: 'From ' + v1('IRN', 1985) + ' in 1985 down to ' + v1('IRN', 2000) +
                  ' by 2000. Hardly anywhere has moved that fast.' },
          { code: 'BGD', year: 2000, dx: 52, dy: 96, align: 'left', wrap: 190,
            title: 'Bangladesh, slowly',
            text: v1('BGD', 1971) + ' in 1971, ' + v1('BGD', 2024) +
                  ' today. No sharp turns, just decades of steady decline.' }
        ]
      },
      {
        heading: 'Through the floor',
        subtitle: 'South Korea kept going past every level anyone thought was the bottom. ' +
                  "The vertical axis is zoomed in here; the 2.1 line hasn't moved.",
        featured: [
          { code: 'JPN', color: COL.JPN },
          { code: 'ITA', color: COL.ITA },
          { code: 'CHN', color: COL.CHN },
          { code: 'KOR', color: COL.KOR }
        ],
        world: 0.5, water: true, zoom: true,
        notes: [
          { code: 'KOR', year: 1983, dx: -160, dy: 108, align: 'left', wrap: 188,
            title: 'Below replacement in 1983',
            text: 'Korea slipped under 2.1 that year and has never been back above it since.' },
          { code: 'KOR', year: 2018, dx: -164, dy: -70, align: 'right', wrap: 182,
            title: 'Under one child',
            text: 'Only Hong Kong and Macao, both city territories, had ever been here before.' },
          { code: 'KOR', year: 2024, dx: -128, dy: 40, align: 'right', wrap: 188,
            title: v2('KOR', 2023) + ' → ' + v2('KOR', 2024),
            text: "2023 was Korea's lowest year on record. Then 2024 ticked up, the first " +
                  'rise in nine years.' }
        ]
      },
      {
        heading: 'One region is still turning',
        subtitle: 'Sub-Saharan Africa began falling later, and from higher up. Most of the ' +
                  'population growth left this century is expected to happen here.',
        featured: [
          { code: 'SSF', color: COL.SSF },
          { code: 'NER', color: COL.NER }
        ],
        world: 0.5, water: true, zoom: false,
        notes: [
          { code: 'NER', year: 2024, dx: -206, dy: -52, align: 'right', wrap: 190,
            title: 'Niger: ' + v1('NER', 2024),
            text: 'Highest in the world every year from 1995 to 2018. Four countries have ' +
                  'since passed it.' },
          { code: 'SSF', year: 2024, dx: -196, dy: 40, align: 'right', wrap: 196,
            title: 'Sub-Saharan Africa: ' + v1('SSF', 2024),
            text: 'Falling as well, just later and from much further up.' }
        ]
      },
      {
        heading: 'Now go and look for yourself',
        subtitle: 'A world that averaged nearly five children per woman now averages just ' +
                  'over two. Korea sits far below that, Sub-Saharan Africa well above. ' +
                  'Every country has its own version of this story.',
        featured: [ { code: 'SSF', color: COL.SSF } ],
        world: 1, water: true, zoom: false, explore: true,
        notes: []
      }
    ];
  }

  /* --------------------------------------------------------- page chrome  */

  function buildChrome() {
    // index.html paints six dots so the nav row is complete before the CSV
    // arrives; rebuild them here only if the scene count ever differs
    if (el.dots.children.length !== scenes.length) {
      el.dots.innerHTML = '';
      for (var i = 0; i < scenes.length; i++) {
        var dot = document.createElement('span');
        dot.className = 'dot';
        el.dots.appendChild(dot);
      }
    }

    series.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.name;
      el.datalist.appendChild(opt);
    });

  }

  /* ------------------------------------------------------- scene painting */

  function baseStyle(scene, s) {
    var f = null;
    for (var i = 0; i < scene.featured.length; i++) {
      if (scene.featured[i].code === s.code) { f = scene.featured[i]; break; }
    }
    if (s.code === 'WLD') return { stroke: COL.ink, width: 2.6, opacity: scene.world };
    if (f) return { stroke: f.color, width: s.isAggregate ? 2.5 : 2.2, opacity: 1 };
    if (s.isAggregate) return { stroke: COL.SSF, width: 2.5, opacity: 0 };
    return { stroke: COL.faint, width: 1, opacity: 0.34 };
  }

  // Scene 6 only: exploration modifiers layered on top of the base style.
  function exploreStyle(s, st) {
    if (pinned === s.code) return { stroke: COL.KOR, width: 2.6, opacity: 1 };
    if (hovered === s.code) {
      // emphasise, never de-emphasise: a line that already carries its own
      // colour (the world line, an aggregate) keeps it and just thickens.
      var plain = st.stroke === COL.faint;
      return {
        stroke: plain ? COL.ink : st.stroke,
        width: Math.max(st.width + 0.9, 1.8),
        opacity: 1
      };
    }
    return st;
  }

  /* Stacking order, back to front, as a pure function of the scene: the scene's
     featured list in its authored order (so the last one listed is the star),
     then — in scene 6 only — the hovered line and finally the pinned one. */
  function frontOrder(scene) {
    var order = scene.featured.map(function (f) { return f.code; });
    if (scene.explore) {
      if (hovered && order.indexOf(hovered) < 0) order.push(hovered);
      if (pinned) {
        var at = order.indexOf(pinned);
        if (at >= 0) order.splice(at, 1);
        order.push(pinned);
      }
    }
    return order;
  }

  /* full = true rebuilds the whole DOM order from the canonical series list, so
     the drawing order after a scene change can never depend on the route taken
     to get there.  Scene 6's per-mousemove repaints use the cheap path. */
  function applyOrder(scene, full) {
    var order = frontOrder(scene);
    var isFront = {};
    order.forEach(function (c) { isFront[c] = true; });

    if (full) {
      front = {};
      series.forEach(function (s) {
        if (isFront[s.code]) return;
        (s.code === 'WLD' ? gWorld : gLines).node().appendChild(s.path.node());
      });
    } else {
      Object.keys(front).forEach(function (code) {
        if (isFront[code]) return;
        (code === 'WLD' ? gWorld : gLines).node().appendChild(byCode[code].path.node());
        delete front[code];
      });
    }
    order.forEach(function (code) {
      gFeatured.node().appendChild(byCode[code].path.node());
      front[code] = true;
    });
  }

  function goTo(i, instant) {
    if (i < 0 || i >= scenes.length) return;
    var leavingExplore = scenes[current] && scenes[current].explore && !scenes[i].explore;
    current = i;
    if (leavingExplore) clearExplore();      // scene 6 never leaks into 1–5
    applyScene(scenes[i], !!instant);
    updateChrome();
  }

  function applyScene(scene, instant) {
    var token = ++sceneToken;
    var dur = instant ? 0 : DUR;

    if (noteTimer) { clearTimeout(noteTimer); noteTimer = null; }
    gNotes.interrupt('notes');
    if (dur > 0) gNotes.transition('notes').duration(180).style('opacity', 0);
    else gNotes.style('opacity', 0).selectAll('*').remove();

    // exploration interactivity belongs to scene 6 alone
    setExploreMode(!!scene.explore, dur, token);

    // 1 · line styling — recomputed from scratch for every series, every time,
    //     so no earlier state (including scene-6 pins) can survive a scene change
    applyOrder(scene, true);
    series.forEach(function (s) {
      var st = baseStyle(scene, s);
      if (scene.explore) st = exploreStyle(s, st);
      var sel = s.path.interrupt('scene');
      if (dur > 0) sel = sel.transition('scene').duration(dur).ease(d3.easeCubicInOut);
      sel.attr('stroke', st.stroke).attr('stroke-width', st.width).attr('opacity', st.opacity);
    });

    // 2 · waterline
    fade(waterLine, scene.water ? 1 : 0, dur);
    fade(tintRect, scene.water ? 0.055 : 0, dur);
    fade(waterLabel, scene.water ? 1 : 0, dur);

    // 3 · vertical zoom
    var targetK = scene.zoom ? (Y_FULL / Y_ZOOM) : 1;
    applyZoom(targetK, dur);
    applyYAxis(scene.zoom ? Y_ZOOM : Y_FULL, dur);
    fade(zoomBadge, scene.zoom ? 1 : 0, dur);

    // 4 · right-hand line labels
    updateLabels(scene, targetK, dur);

    // 5 · notes, once the movement settles
    if (dur > 0) {
      noteTimer = setTimeout(function () {
        if (token !== sceneToken) return;
        renderNotes(scene);
      }, NOTE_DELAY);
    } else {
      renderNotes(scene);
    }

    // 6 · heading crossfade
    if (dur > 0 && el.head) {
      el.head.classList.add('fading');
      setTimeout(function () {
        if (token !== sceneToken) return;
        el.heading.textContent = scene.heading;
        el.subtitle.textContent = scene.subtitle;
        el.head.classList.remove('fading');
      }, 200);
    } else {
      el.heading.textContent = scene.heading;
      el.subtitle.textContent = scene.subtitle;
      if (el.head) el.head.classList.remove('fading');
    }
  }

  function fade(sel, opacity, dur) {
    var s = sel.interrupt('fade');
    if (dur > 0) s = s.transition('fade').duration(dur).ease(d3.easeCubicInOut);
    s.attr('opacity', opacity);
  }

  function applyZoom(targetK, dur) {          // updateLabels moves the waterline label
    gZoom.interrupt('zoom');
    var fromK = zoomK;
    if (dur === 0 || fromK === targetK) {
      zoomK = targetK;
      gZoom.attr('transform', zoomTransform(targetK));
      return;
    }
    gZoom.transition('zoom').duration(dur).ease(d3.easeCubicInOut)
      .attrTween('transform', function () {
        return function (t) {
          zoomK = fromK + (targetK - fromK) * t;
          return zoomTransform(zoomK);
        };
      })
      .on('end interrupt', function () { zoomK = +zoomK; });
  }

  /* --------------------------------------------------------- right labels */

  function labelSet(scene) {
    var out = [];
    scene.featured.forEach(function (f) {
      var s = byCode[f.code];
      if (s) out.push({ code: s.code, name: s.name, color: f.color, series: s });
    });
    if (scene.explore && pinned) {
      var already = out.some(function (o) { return o.code === pinned; });
      if (!already) out.push({ code: pinned, name: byCode[pinned].name, color: COL.KOR, series: byCode[pinned] });
      else out.forEach(function (o) { if (o.code === pinned) o.color = COL.KOR; });
    }
    return out;
  }

  function updateLabels(scene, k, dur) {
    var items = labelSet(scene);
    items.forEach(function (it) {
      it.x = x(it.series.lastYear) + 7;
      it.y = pixOf(it.series.lastValue, k) + 3.5;
    });
    // The "replacement ≈2.1" label shares the right-hand margin with the country
    // names, so it joins the de-collision — as an immovable anchor, since it
    // marks one exact value.  Country labels move around it.
    var waterY = pixOf(REPLACEMENT, k) + 3.5;
    if (scene.water) items.push({ code: '__water__', fixed: true, y: waterY });

    items.sort(function (a, b) { return a.y - b.y; });
    var MIN = 12.5;
    var i, j;
    for (i = 1; i < items.length; i++) {
      if (items[i].y - items[i - 1].y >= MIN) continue;
      if (items[i].fixed) {                     // push the ones above it upwards
        items[i - 1].y = items[i].y - MIN;
        for (j = i - 1; j > 0; j--) {
          if (items[j].y - items[j - 1].y < MIN) items[j - 1].y = items[j].y - MIN;
        }
      } else {
        items[i].y = items[i - 1].y + MIN;
      }
    }
    for (j = items.length - 1; j >= 0; j--) {
      if (!items[j].fixed && items[j].y > PLOT.bottom) items[j].y = PLOT.bottom;
      if (j > 0 && !items[j - 1].fixed && items[j].y - items[j - 1].y < MIN) {
        items[j - 1].y = items[j].y - MIN;
      }
    }
    items.forEach(function (it) { if (!it.fixed) it.y = Math.max(PLOT.top + 8, it.y); });

    var wl = waterLabel.interrupt('lbl');
    if (dur > 0) wl = wl.transition('lbl').duration(dur).ease(d3.easeCubicInOut);
    wl.attr('y', waterY);
    items = items.filter(function (it) { return !it.fixed; });

    var sel = gLabels.selectAll('text.line-label').data(items, function (d) { return d.code; });

    sel.exit().interrupt('lbl')
       .call(function (s) {
         if (dur > 0) s.transition('lbl').duration(dur / 2).attr('opacity', 0).remove();
         else s.remove();
       });

    var ent = sel.enter().append('text')
        .attr('class', 'line-label')
        .attr('x', function (d) { return d.x; })
        .attr('y', function (d) { return d.y; })
        .attr('opacity', 0)
        .text(function (d) { return d.name; });

    var all = ent.merge(sel).interrupt('lbl');
    all.text(function (d) { return d.name; }).attr('fill', function (d) { return d.color; });
    // a long name (e.g. "St. Vincent and the Grenadines", pinned in scene 6)
    // would otherwise run past the right edge of the 960-unit frame
    all.each(function (d) {
      var len;
      try { len = this.getComputedTextLength(); } catch (e) { len = d.name.length * 5.6; }
      if (d.x + len > VB.w - 4) d.x = Math.max(PLOT.right - 72, VB.w - 4 - len);
    });
    if (dur > 0) {
      all.transition('lbl').duration(dur).ease(d3.easeCubicInOut)
         .attr('x', function (d) { return d.x; })
         .attr('y', function (d) { return d.y; })
         .attr('opacity', 1);
    } else {
      all.attr('x', function (d) { return d.x; })
         .attr('y', function (d) { return d.y; })
         .attr('opacity', 1);
    }
  }

  /* ---------------------------------------------------------------- notes */

  function noteAnchor(n) {
    var vy = (n.value !== undefined) ? n.value : val(n.code, n.year);
    return { x: x(n.year), y: pixOf(vy) };
  }

  function renderNotes(scene) {
    gNotes.interrupt('notes');
    gNotes.selectAll('*').remove();
    if (!scene.notes || !scene.notes.length) { gNotes.style('opacity', 0); return; }

    var anns = scene.notes.map(function (n) {
      var a = noteAnchor(n);
      return {
        x: a.x, y: a.y, dx: n.dx, dy: n.dy,
        note: { title: n.title, label: n.text, wrap: n.wrap || 190,
                align: n.align || 'left', padding: 4, lineType: 'horizontal' },
        connector: { type: 'line' },
        _raw: n
      };
    });

    var ok = false;
    if (typeof d3.annotation === 'function' && typeof d3.annotationLabel !== 'undefined') {
      try {
        gNotes.call(d3.annotation().type(d3.annotationLabel).annotations(anns));
        ok = gNotes.selectAll('text').size() > 0;
      } catch (e) { ok = false; }
    }
    if (!ok) {                       // hand-drawn notes, same look, no extra library
      gNotes.selectAll('*').remove();
      anns.forEach(function (a) { drawNote(a); });
    }

    gNotes.style('opacity', 0).transition('notes').duration(NOTE_FADE).style('opacity', 1);
  }

  function drawNote(a) {
    var g = gNotes.append('g');
    var nx = a.x + a.dx, ny = a.y + a.dy;
    var right = a.note.align === 'right';
    var w = a.note.wrap;

    g.append('path').attr('class', 'note-connector')
      .attr('d', 'M' + a.x + ',' + a.y + 'L' + nx + ',' + ny);
    g.append('circle').attr('class', 'note-dot')
      .attr('cx', a.x).attr('cy', a.y).attr('r', 1.8);
    g.append('path').attr('class', 'note-rule')
      .attr('d', 'M' + (right ? nx - w : nx) + ',' + ny + 'h' + w);

    var anchor = right ? 'end' : 'start';
    var tx = nx;
    g.append('text').attr('class', 'note-title')
      .attr('x', tx).attr('y', ny + 13).attr('text-anchor', anchor)
      .text(a.note.title);

    var lines = wrapText(a.note.label, w, 10.5);
    lines.forEach(function (ln, i) {
      g.append('text').attr('class', 'note-label')
        .attr('x', tx).attr('y', ny + 26 + i * 12).attr('text-anchor', anchor)
        .text(ln);
    });
  }

  function wrapText(text, width, size) {
    var words = String(text).split(/\s+/), lines = [], line = [];
    var per = size * 0.5;                       // rough average glyph width
    words.forEach(function (w) {
      line.push(w);
      if (line.join(' ').length * per > width) {
        if (line.length > 1) { var last = line.pop(); lines.push(line.join(' ')); line = [last]; }
        else { lines.push(line.join(' ')); line = []; }
      }
    });
    if (line.length) lines.push(line.join(' '));
    return lines;
  }

  /* ----------------------------------------------------------- navigation */

  function updateChrome() {
    el.counter.textContent = (current + 1) + ' / ' + scenes.length;
    Array.prototype.forEach.call(el.dots.children, function (d, i) {
      d.classList.toggle('on', i === current);
    });
    el.back.disabled = current === 0;
    el.next.disabled = current === scenes.length - 1;
    el.next.textContent = (current === scenes.length - 2) ? 'Explore →' : 'Next →';
  }

  function wireControls() {
    el.back.addEventListener('click', function () { goTo(current - 1); });
    el.next.addEventListener('click', function () { goTo(current + 1); });

    document.addEventListener('keydown', function (ev) {
      var t = ev.target;
      // typing in the search box must never change scenes
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (ev.key === 'ArrowRight') { ev.preventDefault(); goTo(current + 1); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); goTo(current - 1); }
    });

    el.reset.addEventListener('click', function () {
      clearExplore();
      repaintExplore();
    });

    el.search.addEventListener('change', function () { commitSearch(); });
    el.search.addEventListener('input', function () {
      // fires when an autocomplete suggestion is chosen
      var v = el.search.value.trim().toLowerCase();
      var hitS = series.filter(function (s) { return s.name.toLowerCase() === v; });
      if (hitS.length) commitSearch();
    });
    el.search.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); commitSearch(); }
    });
  }

  /* ------------------------------------------------------ scene 6: mouse */

  function armChart() {
    svg.classed('interactive', true);
    hit.style('pointer-events', 'all')
       .on('mousemove', onMove).on('mouseleave', onLeave).on('click', onClick);
  }

  function disarmChart() {
    svg.classed('interactive', false);
    hit.style('pointer-events', 'none')
       .on('mousemove', null).on('mouseleave', null).on('click', null);
    hideTooltip();
  }

  function setExploreMode(on, dur, token) {
    el.explore.classList.toggle('on', on);
    el.explore.setAttribute('aria-hidden', on ? 'false' : 'true');
    el.search.disabled = !on;
    el.reset.disabled = !on;

    if (armTimer) { clearTimeout(armTimer); armTimer = null; }
    disarmChart();
    if (!on) return;
    // The mouse comes alive only once scene 6 has finished arriving, so a stray
    // pointer cannot interrupt the entry transition or read a mid-tween zoom.
    if (dur > 0) {
      armTimer = setTimeout(function () {
        if (token !== sceneToken) return;
        armChart();
      }, dur + 30);
    } else {
      armChart();
    }
  }

  function nearest(mx, my) {
    var yr = Math.round(x.invert(mx));
    if (yr < YEAR0) yr = YEAR0;
    if (yr > YEAR1) yr = YEAR1;
    var best = null, bestD = Infinity;
    for (var i = 0; i < series.length; i++) {
      var s = series[i];
      var v = s.byYear.get(yr);
      if (v === undefined) continue;
      var d = Math.abs(pixOf(v) - my);
      if (d < bestD) { bestD = d; best = { series: s, year: yr, value: v, dist: d }; }
    }
    return (best && best.dist <= 16) ? best : null;
  }

  function onMove(ev) {
    var p = d3.pointer(ev, svg.node());
    var n = nearest(p[0], p[1]);
    var code = n ? n.series.code : null;
    if (code !== hovered) { hovered = code; repaintExplore(); }
    if (n) showTooltip(ev, n); else hideTooltip();
  }

  function onLeave() {
    if (hovered !== null) { hovered = null; repaintExplore(); }
    hideTooltip();
  }

  function onClick(ev) {
    var p = d3.pointer(ev, svg.node());
    var n = nearest(p[0], p[1]);
    if (!n) return;
    pinned = (pinned === n.series.code) ? null : n.series.code;
    repaintExplore();
  }

  function showTooltip(ev, n) {
    var r = el.wrap.getBoundingClientRect();
    var left = ev.clientX - r.left + 14;
    var top = ev.clientY - r.top + 14;
    el.tooltip.textContent = n.series.name + ' · ' + n.year + ': ' + f2(n.value);
    el.tooltip.classList.add('on');
    var tw = el.tooltip.offsetWidth, th = el.tooltip.offsetHeight;
    if (left + tw > r.width) left = ev.clientX - r.left - tw - 14;
    if (top + th > r.height) top = ev.clientY - r.top - th - 14;
    el.tooltip.style.transform = 'translate(' + left + 'px,' + top + 'px)';
  }

  function hideTooltip() { el.tooltip.classList.remove('on'); }

  // Hiding a region hides a pinned country inside it too — the pin is kept, so
  // switching the region back on brings it straight back.
  function commitSearch() {
    var v = el.search.value.trim().toLowerCase();
    if (!v) return;
    var found = null;
    for (var i = 0; i < series.length; i++) {
      if (series[i].name.toLowerCase() === v) { found = series[i]; break; }
    }
    if (!found) {
      for (var j = 0; j < series.length; j++) {
        if (series[j].name.toLowerCase().indexOf(v) === 0) { found = series[j]; break; }
      }
    }
    if (!found) return;
    pinned = found.code;
    repaintExplore();
  }

  function clearExplore() {
    pinned = null;
    hovered = null;
    if (el.search) el.search.value = '';
    hideTooltip();
  }

  // Repaint scene 6 from its authored base plus the current exploration state.
  function repaintExplore() {
    var scene = scenes[current];
    if (!scene || !scene.explore) return;

    applyOrder(scene, false);
    series.forEach(function (s) {
      var st = exploreStyle(s, baseStyle(scene, s));
      s.path.interrupt('scene')
        .attr('stroke', st.stroke).attr('stroke-width', st.width).attr('opacity', st.opacity);
    });

    updateLabels(scene, zoomK, 0);
  }

})();
