// charts.js
let errorChart = null;
const MAX_POINTS = 200;
let startTime = null; // 첫 데이터 수신 시각 (status.time 기준)

function initErrorChart(ctx) {
  errorChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "x_error",
          data: [],
          borderWidth: 2,
          tension: 0.2,
        },
        {
          label: "y_error",
          data: [],
          borderWidth: 2,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        x: {
          title: { display: true, text: "time (s from start)" },
        },
        y: {
          title: { display: true, text: "Error" },
          min: -30,   // 0을 중심으로 -1 ~ 1 범위 고정
          max: 30,
        },
      },
      plugins: {
        legend: {
          display: true,
        },
      },
    },
  });
}

function addErrorPoint(timeSec, xErr, yErr) {
  if (!errorChart) return;
  if (typeof timeSec !== "number" || Number.isNaN(timeSec)) {
    return;
  }

  if (startTime === null) {
    startTime = timeSec;
  }

  const tRel = timeSec - startTime; // 상대 시간 (초)

  const labels = errorChart.data.labels;
  const xData = errorChart.data.datasets[0].data;
  const yData = errorChart.data.datasets[1].data;

  labels.push(tRel.toFixed(2));
  xData.push(xErr);
  yData.push(yErr);

  if (labels.length > MAX_POINTS) {
    labels.shift();
    xData.shift();
    yData.shift();
  }

  // 디버깅용 로그 (원하면 나중에 지워도 됨)
  console.log("addErrorPoint:", { tRel, xErr, yErr });

  errorChart.update("none");
}

// 전역으로 노출
window.initErrorChart = initErrorChart;
window.addErrorPoint = addErrorPoint;
