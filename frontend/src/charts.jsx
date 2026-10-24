import React, { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const chartOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 12 } } },
  scales: {
    x: { ticks: { color: '#64748b' }, grid: { color: '#1e2947' } },
    y: { ticks: { color: '#64748b' }, grid: { color: '#1e2947' } },
    y1: { position: 'right', ticks: { color: '#64748b' }, grid: { display: false } },
  },
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
          { label: 'Заявки', data: series.map(x => x.count), borderColor: '#818cf8',
            backgroundColor: 'rgba(129,140,248,.15)', fill: true, tension: .35, yAxisID: 'y', pointRadius: 2 },
          { label: 'Выручка ₽', data: series.map(x => x.revenue), borderColor: '#34d399',
            tension: .35, yAxisID: 'y1', pointRadius: 2 },
        ],
      },
      options: chartOpts,
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
        labels: top.map(x => (x.name.length > 16 ? x.name.slice(0, 15) + '…' : x.name)),
        datasets: [{
          data: top.map(x => x.qty),
          backgroundColor: ['#818cf8', '#a78bfa', '#f472b6', '#fbbf24', '#34d399'],
          borderRadius: 6,
        }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: '#1e2947' } },
          y: { ticks: { color: '#94a3b8' }, grid: { display: false } },
        },
      },
    });
    return () => chart.destroy();
  }, [JSON.stringify(top)]);
  return <div className="h-64"><canvas ref={ref} /></div>;
}
