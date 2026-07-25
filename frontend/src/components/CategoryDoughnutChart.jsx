import { Doughnut } from 'react-chartjs-2';

const CATEGORY_COLORS = {
  Groceries: '#5b9dff',
  Transport: '#f59e0b',
  Dining: '#ef4444',
  Utilities: '#a855f7',
  Entertainment: '#22c55e',
  Other: '#6b7280',
};

function categoryColor(label) {
  return CATEGORY_COLORS[label] || '#6b7280';
}

function dimColor(hex) {
  const value = parseInt(hex.replace('#', ''), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, 0.25)`;
}

/**
 * Spend-by-category doughnut, reused on both the dashboard (no active
 * category — every slice full color) and the category detail page (the
 * current page's category highlighted, everything else dimmed). Clicking
 * a slice navigates to that category's own detail page via onSliceClick;
 * clicking the already-active slice is a no-op.
 */
export default function CategoryDoughnutChart({ labels, totals, activeCategory, onSliceClick }) {
  if (!labels.length) return null;

  const isActive = (label) =>
    activeCategory && label.toLowerCase() === activeCategory.toLowerCase();

  const data = {
    labels,
    datasets: [
      {
        data: totals,
        backgroundColor: labels.map((label) => {
          const base = categoryColor(label);
          return activeCategory && !isActive(label) ? dimColor(base) : base;
        }),
        offset: labels.map((label) => (isActive(label) ? 18 : 0)),
      },
    ],
  };

  const options = {
    plugins: {
      legend: {
        position: 'bottom',
        align: 'center',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          boxHeight: 8,
          padding: 16,
          font: { size: 13 },
        },
      },
    },
    onClick: (event, elements) => {
      if (!elements.length || !onSliceClick) return;
      const label = labels[elements[0].index];
      if (isActive(label)) return;
      onSliceClick(label);
    },
    onHover: (event, elements) => {
      event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
    },
  };

  return (
    <div style={{ maxWidth: 280, margin: '0 auto' }}>
      <Doughnut data={data} options={options} />
    </div>
  );
}
