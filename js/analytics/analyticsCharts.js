/**
 * Analytics Charts Renderer
 * High-performance Canvas rendering of Equity Curve and Profit/Loss breakdowns.
 */
export class AnalyticsChartsRenderer {
  renderEquityCurve(canvas, equityPoints, initialBalance = 1000) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.parentElement.clientWidth || 600;
    const height = canvas.height = 220;

    ctx.clearRect(0, 0, width, height);

    // Dark MT5 background
    ctx.fillStyle = '#181b22';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#232733';
    ctx.lineWidth = 1;
    for (let y = 30; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();
    }

    if (!equityPoints || equityPoints.length === 0) {
      ctx.fillStyle = '#656d81';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Chưa có dữ liệu lệnh đã đóng để vẽ đường cong tăng trưởng vốn', width / 2, height / 2);
      return;
    }

    const values = [initialBalance, ...equityPoints.map(p => initialBalance + p.cumulativeProfit)];
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = (maxVal - minVal) || 100;
    const paddingBottom = 30;
    const paddingTop = 20;
    const paddingLeft = 55;
    const paddingRight = 20;

    const plotW = width - paddingLeft - paddingRight;
    const plotH = height - paddingTop - paddingBottom;

    const getX = (idx) => paddingLeft + (idx / (values.length - 1)) * plotW;
    const getY = (val) => paddingTop + plotH - ((val - minVal) / range) * plotH;

    // Y Axis labels
    ctx.fillStyle = '#8a94a6';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('$' + maxVal.toFixed(0), paddingLeft - 8, paddingTop + 10);
    ctx.fillText('$' + ((maxVal + minVal) / 2).toFixed(0), paddingLeft - 8, paddingTop + plotH / 2);
    ctx.fillText('$' + minVal.toFixed(0), paddingLeft - 8, paddingTop + plotH);

    // Gradient fill under curve
    const gradient = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + plotH);
    const isProfitable = values[values.length - 1] >= initialBalance;
    if (isProfitable) {
      gradient.addColorStop(0, 'rgba(0, 200, 83, 0.28)');
      gradient.addColorStop(1, 'rgba(0, 200, 83, 0.0)');
    } else {
      gradient.addColorStop(0, 'rgba(255, 61, 0, 0.28)');
      gradient.addColorStop(1, 'rgba(255, 61, 0, 0.0)');
    }

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(values[0]));
    for (let i = 1; i < values.length; i++) {
      ctx.lineTo(getX(i), getY(values[i]));
    }
    ctx.lineTo(getX(values.length - 1), paddingTop + plotH);
    ctx.lineTo(getX(0), paddingTop + plotH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Main line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(values[0]));
    for (let i = 1; i < values.length; i++) {
      ctx.lineTo(getX(i), getY(values[i]));
    }
    ctx.strokeStyle = isProfitable ? '#00c853' : '#ff3d00';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // End point highlight dot
    const lastX = getX(values.length - 1);
    const lastY = getY(values[values.length - 1]);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = isProfitable ? '#00e676' : '#ff5252';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  renderSessionBars(canvas, profitBySession) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.parentElement.clientWidth || 300;
    const height = canvas.height = 180;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#181b22';
    ctx.fillRect(0, 0, width, height);

    const sessions = ['Asian', 'London', 'New York'];
    const values = sessions.map(s => profitBySession[s] || 0);
    const maxAbs = Math.max(10, ...values.map(v => Math.abs(v)));

    const centerY = height / 2;
    const barWidth = 45;
    const spacing = (width - barWidth * 3) / 4;

    // Center zero line
    ctx.strokeStyle = '#323746';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, centerY);
    ctx.lineTo(width - 20, centerY);
    ctx.stroke();

    sessions.forEach((sess, idx) => {
      const val = values[idx];
      const x = spacing + idx * (barWidth + spacing);
      const barH = (Math.abs(val) / maxAbs) * (height / 2 - 25);
      const y = val >= 0 ? centerY - barH : centerY;

      ctx.fillStyle = val >= 0 ? '#00c853' : '#ff3d00';
      ctx.fillRect(x, y, barWidth, Math.max(2, barH));

      // Session label
      ctx.fillStyle = '#8a94a6';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(sess, x + barWidth / 2, height - 6);

      // Value label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.fillText((val >= 0 ? '+$' : '-$') + Math.abs(val).toFixed(0), x + barWidth / 2, val >= 0 ? y - 4 : y + barH + 11);
    });
  }
}

export const analyticsCharts = new AnalyticsChartsRenderer();
