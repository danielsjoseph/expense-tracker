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

  const options = {
    // Without this, Chart.js keeps the same width:height ratio as desktop —
    // on a narrow mobile card that meant the chart's height shrank right
    // along with its width, making it look squashed. A fixed-height wrapper
    // plus this keeps the height stable regardless of screen width.
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  };

  return (
    <div style={{ height: 240 }}>
      <Line data={data} options={options} />
    </div>
  );
}
