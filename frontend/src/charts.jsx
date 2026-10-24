import React, { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const INK2 = '#86868b';
const GRID = 'rgba(0,0,0,.055)';

const baseOpts = extra => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#1d1d1f', usePointStyle: true, pointStyle: 'circle', boxWidth: 7, boxHeight: 7, padding: 14 } },
    tooltip: {
      backgroundColor: '#1d1d1f', titleColor: '#fff', bodyColor: '#e8e8ed',
      cornerRadius: 10, padding: 10, displayColors: true, usePointStyle: true,
    },
  },
  ...extra,
});

const scales = {
  x: { ticks: { color: INK2, font: { size: 11 } }, grid: { display: false }, border: { display: false } },
  y: { ticks: { color: INK2, font: { size: 11 }, maxTicksLimit: 6 }, grid: { color: GRID }, border: { display: false } },
};

export function SalesChart({ series }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const chart = new Chart(ref.current, {
      type: 'line',
      data: {
        labels: series.map(x => x.date),
        datasets: [
          {
            label: 'Заявки',
            data: series.map(x => x.count),
            borderColor: '#0071e3',
            backgroundColor: 'rgba(0,113,227,.07)',
            fill: true, tension: .4, borderWidth: 2.2, pointRadius: 0,
            pointHoverRadius: 4.5, pointHoverBackgroundColor: '#0071e3', yAxisID: 'y',
          },
          {
            label: 'Выручка ₽',
            data: series.map(x => x.revenue),
            borderColor: '#34c759',
            tension: .4, borderWidth: 2.2, pointRadius: 0,
            pointHoverRadius: 4.5, pointHoverBackgroundColor: '#34c759', yAxisID: 'y1',
          },
        ],
      },
      options: baseOpts({
        interaction: { mode: 'index', intersect: false },
        scales: { ...scales, y1: { ...scales.y, position: 'right', grid: { display: false } } },
      }),
    });
    return () => chart.destroy();
  }, [JSON.stringify(series)]);
  return <div className="h-64"><canvas ref={ref} /></div>;
}

export function TopProducts({ top }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const chart = new Chart(ref.current, {
      type: 'bar',
      data: {
        labels: top.map(x => (x.name.length > 18 ? x.name.slice(0, 17) + '…' : x.name)),
        datasets: [{
          data: top.map(x => x.qty),
          backgroundColor: '#0071e3', hoverBackgroundColor: '#0077ed',
          borderRadius: 7, borderSkipped: false, barPercentage: .55,
        }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: baseOpts({}).tooltip },
        scales: { x: scales.y, y: { ...scales.x, ticks: { ...scales.x.ticks, padding: 8 } } },
      },
    });
    return () => chart.destroy();
  }, [JSON.stringify(top)]);
  return <div className="h-64"><canvas ref={ref} /></div>;
}
