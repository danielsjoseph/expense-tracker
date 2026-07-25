import { Line } from 'react-chartjs-2';

export default function DailyLineChart({ labels, totals }) {
  const data = {
    labels,
    datasets: [
      {
        label: 'Daily spend',
        data: totals,
        borderColor: '#5b9dff',
        backgroundColor: 'rgba(91, 157, 255, 0.15)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#5b9dff',
      },
    ],
  };

  const options = { plugins: { legend: { display: false } } };

  return <Line data={data} options={options} height={80} />;
}
