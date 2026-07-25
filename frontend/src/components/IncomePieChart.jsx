import { Pie } from 'react-chartjs-2';

export default function IncomePieChart({ labels, totals }) {
  if (!labels.length) return null;

  const data = {
    labels,
    datasets: [
      {
        data: totals,
        backgroundColor: labels.map((label) =>
          label === 'Remaining' ? '#22c55e' : label === 'Over budget' ? '#ef4444' : '#5b9dff'
        ),
      },
    ],
  };

  return (
    <div style={{ maxWidth: 260, margin: '0 auto' }}>
      <Pie data={data} />
    </div>
  );
}
