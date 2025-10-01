const { DateTime } = luxon;

let transactions = [];
try {
  transactions = JSON.parse(localStorage.getItem('transactions')) || [];
  transactions = transactions.map(t => ({
    description: t.description || '',
    amount: parseFloat(t.amount) || 0,
    type: t.type || 'income',
    date: t.date || DateTime.now().setZone('Asia/Jakarta').toISODate(),
    isEditing: false
  }));
} catch (e) {
  console.error('Error parsing localStorage transactions:', e);
  transactions = [];
}

const userTimezone = 'Asia/Jakarta';
const formatter = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Initialize startDate from localStorage or set to current date
let startDate = localStorage.getItem('startDate') 
  ? DateTime.fromISO(localStorage.getItem('startDate'), { zone: userTimezone }) 
  : DateTime.now().setZone(userTimezone);

let exchangeRate = 15000; // Initial fallback rate
let dailyTargetUSD = parseInt(localStorage.getItem('dailyTargetUSD')) || null;
let userName = localStorage.getItem('userName') || '';

async function fetchExchangeRate() {
  const cached = JSON.parse(localStorage.getItem('exchangeRateCache'));
  const now = DateTime.now().toMillis();
  if (cached && now - cached.timestamp < 24 * 60 * 60 * 1000) {
    return cached.rate;
  }
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await response.json();
    const rate = data.rates.IDR;
    localStorage.setItem('exchangeRateCache', JSON.stringify({ rate, timestamp: now }));
    return rate;
  } catch (e) {
    console.error('Error fetching exchange rate:', e);
    return 15000;
  }
}

function getDaysSinceStart(transactionDate) {
  const transactionDateObj = DateTime.fromISO(transactionDate, { zone: userTimezone });
  const timeDiff = transactionDateObj.diff(startDate, 'days').days;
  return Math.max(Math.floor(timeDiff) + 1, 1);
}

function getDailyTarget(date) {
  const dailyTargetIDR = dailyTargetUSD * exchangeRate;
  return dailyTargetIDR * getDaysSinceStart(date);
}

function getDailyTotal(date) {
  return transactions.reduce((acc, t) => t.type === 'income' ? acc + t.amount : acc - t.amount, 0);
}

function getOverallBalance() {
  return transactions.reduce((acc, t) => t.type === 'income' ? acc + t.amount : acc - t.amount, 0);
}

function showInitialTargetModal() {
  const modal = document.getElementById('initial-target-modal');
  if (modal) {
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
    // Pre-fill name if it exists
    const userNameInput = document.getElementById('user-name');
    if (userNameInput && userName) {
      userNameInput.value = userName;
    }
  }
}

function hideInitialTargetModal() {
  const modal = document.getElementById('initial-target-modal');
  if (modal) {
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }
}

function updateUserNameDisplay() {
  const userNameDisplay = document.getElementById('user-name-display');
  if (userNameDisplay) {
    userNameDisplay.textContent = userName ? `Welcome, ${userName}` : 'Welcome';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Fetch exchange rate at page load
  exchangeRate = await fetchExchangeRate();

  // Update user name display
  updateUserNameDisplay();

  // Check if target or name is set; if not, show modal
  if (!dailyTargetUSD || !userName) {
    showInitialTargetModal();
  }

  const hamburger = document.querySelector('.hamburger');
  const navbarMenuHeader = document.querySelector('.navbar-menu-header');
  if (hamburger && navbarMenuHeader) {
    hamburger.addEventListener('click', () => {
      navbarMenuHeader.classList.toggle('active');
      // Pre-fill edit target dropdown
      const editTargetAmount = document.getElementById('edit-target-amount');
      if (editTargetAmount && dailyTargetUSD) {
        editTargetAmount.value = dailyTargetUSD;
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!navbarMenuHeader.contains(e.target) && !hamburger.contains(e.target)) {
        navbarMenuHeader.classList.remove('active');
      }
    });
  }

  // Handle edit target form submission
  const editTargetForm = document.getElementById('edit-target-form');
  if (editTargetForm) {
    editTargetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      dailyTargetUSD = parseInt(document.getElementById('edit-target-amount').value);
      localStorage.setItem('dailyTargetUSD', dailyTargetUSD);
      // Update dropdown in progress-circle to reflect selection
      const targetAmountSelect = document.getElementById('target-amount');
      if (targetAmountSelect) targetAmountSelect.value = dailyTargetUSD;
      // Re-fetch exchange rate
      exchangeRate = await fetchExchangeRate();
      // Close the dropdown
      navbarMenuHeader.classList.remove('active');
      updateBalanceAndTarget();
      updateChartData();
    });
  }

  // Handle initial target form submission
  const initialTargetForm = document.getElementById('initial-target-form');
  if (initialTargetForm) {
    initialTargetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      userName = document.getElementById('user-name').value.trim();
      dailyTargetUSD = parseInt(document.getElementById('initial-target-amount').value);
      // Set startDate to current date when name is entered
      startDate = DateTime.now().setZone(userTimezone);
      localStorage.setItem('userName', userName);
      localStorage.setItem('dailyTargetUSD', dailyTargetUSD);
      localStorage.setItem('startDate', startDate.toISODate());
      // Update dropdown in progress-circle to reflect selection
      const targetAmountSelect = document.getElementById('target-amount');
      if (targetAmountSelect) targetAmountSelect.value = dailyTargetUSD;
      // Re-fetch exchange rate
      exchangeRate = await fetchExchangeRate();
      updateUserNameDisplay();
      hideInitialTargetModal();
      updateBalanceAndTarget();
      updateChartData();
    });
  }

  // Close dropdown on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navbarMenuHeader.classList.contains('active')) {
      navbarMenuHeader.classList.remove('active');
    }
  });

  let chart;
  let currentWeekStart = DateTime.now().setZone(userTimezone).startOf('week');
  let selectedDate = DateTime.now().setZone(userTimezone).toISODate();

  const circle = document.querySelector('.progress-ring__circle');
  const circleText = document.getElementById('circle-text');
  const radius = circle?.r.baseVal.value;
  const circumference = radius ? 2 * Math.PI * radius : 0;

  if (circle && circumference) {
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;
    circle.style.strokeWidth = '10';
  }

  function setProgress(dailyTotal, dailyTarget) {
    if (!circle || !circleText) return;
    const maxProgress = 1000000;
    const percent = Math.min((dailyTotal / maxProgress) * 100, 100);
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDashoffset = offset;
    circle.classList.toggle('success', dailyTotal >= dailyTarget);
    circleText.classList.toggle('success', dailyTotal >= dailyTarget);
  }

  function setSelectedDate(date) {
    selectedDate = DateTime.fromISO(date, { zone: userTimezone }).toISODate();
    updateBalanceAndTarget();
    updateChartData();
  }

  function updateBalanceAndTarget() {
    if (!dailyTargetUSD) return;
    const dailyTotal = getDailyTotal(selectedDate);
    const dailyTarget = getDailyTarget(selectedDate);
    const overallBalance = getOverallBalance();
    if (circleText) circleText.textContent = `Rp${formatter.format(overallBalance)}`;
    setProgress(dailyTotal, dailyTarget);
    const targetElement = document.getElementById('target');
    if (targetElement) targetElement.textContent = `Target for ${selectedDate}: Rp${formatter.format(dailyTarget)}`;
  }

  function initChart() {
    const ctx = document.getElementById('weeklyChart')?.getContext('2d');
    if (!ctx) return;
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [{
          label: '',
          data: [],
          borderColor: '#4CAF50',
          fill: false,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'day',
              displayFormats: { day: 'MMM d' },
              tooltipFormat: 'MMMM d, yyyy',
            },
            min: currentWeekStart.toJSDate(),
            max: currentWeekStart.plus({ days: 6 }).toJSDate(),
            ticks: { color: '#f4f4f9' },
            grid: { color: '#3c3c3c' },
          },
          y: {
            ticks: {
              color: '#f4f4f9',
              callback: value => `Rp${formatter.format(value)}`,
            },
            grid: { color: '#3c3c3c' },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: context => `Rp${formatter.format(context.parsed.y)}`,
            },
          },
        },
        onClick: (event, elements, chart) => {
          const xScale = chart.scales.x;
          const position = Chart.helpers.getRelativePosition(event, chart);
          const dateAtClick = xScale.getValueForPixel(position.x);
          if (dateAtClick) setSelectedDate(DateTime.fromJSDate(dateAtClick, { zone: userTimezone }).toISODate());
        },
      },
    });
    updateChartData();
  }

  function getWeeklyData(startDate) {
    const data = [];
    for (let i = 0; i < 7; i++) {
      const date = startDate.plus({ days: i });
      const cumulativeBalance = transactions
        .filter(t => DateTime.fromISO(t.date, { zone: userTimezone }) <= date)
        .reduce((acc, t) => t.type === 'income' ? acc + t.amount : acc - t.amount, 0);
      data.push({ x: date.toJSDate(), y: cumulativeBalance });
    }
    return data;
  }

  function updateChartData() {
    if (!chart || !dailyTargetUSD) return;
    chart.data.datasets[0].data = getWeeklyData(currentWeekStart);
    chart.options.scales.x.min = currentWeekStart.toJSDate();
    chart.options.scales.x.max = currentWeekStart.plus({ days: 6 }).toJSDate();
    chart.data.datasets[0].borderColor = getDailyTotal(selectedDate) >= getDailyTarget(selectedDate) ? '#4CAF50' : '#F44336';
    chart.update();
    document.getElementById('currentWeekBtn').classList.toggle('hidden', currentWeekStart.toISODate() === DateTime.now().setZone(userTimezone).startOf('week').toISODate());
  }

  // Initialize target amount dropdown
  const targetAmountSelect = document.getElementById('target-amount');
  if (targetAmountSelect && dailyTargetUSD) {
    targetAmountSelect.value = dailyTargetUSD;
    targetAmountSelect.addEventListener('change', async () => {
      dailyTargetUSD = parseInt(targetAmountSelect.value);
      localStorage.setItem('dailyTargetUSD', dailyTargetUSD);
      exchangeRate = await fetchExchangeRate();
      updateBalanceAndTarget();
      updateChartData();
    });
  }

  initChart();
  if (dailyTargetUSD) {
    updateBalanceAndTarget();
  }
  document.getElementById('current-date').textContent = DateTime.now().setZone(userTimezone).toLocaleString(DateTime.DATE_FULL);
  document.getElementById('currentWeekBtn').addEventListener('click', () => {
    currentWeekStart = DateTime.now().setZone(userTimezone).startOf('week');
    updateChartData();
  });
  const chartContainer = document.querySelector('.chart-container');
  let touchStartX = 0;
  let touchEndX = 0;
  chartContainer.addEventListener('touchstart', e => touchStartX = e.touches[0].clientX, { passive: true });
  chartContainer.addEventListener('touchmove', e => touchEndX = e.touches[0].clientX, { passive: true });
  chartContainer.addEventListener('touchend', () => {
    const swipeThreshold = 50;
    const swipeDistance = touchEndX - touchStartX;
    if (swipeDistance > swipeThreshold) {
      currentWeekStart = currentWeekStart.minus({ days: 7 });
      updateChartData();
    } else if (swipeDistance < -swipeThreshold) {
      currentWeekStart = currentWeekStart.plus({ days: 7 });
      updateChartData();
    }
  });

  // Listen for storage changes to update progress when transactions change
  window.addEventListener('storage', () => {
    updateBalanceAndTarget();
    updateChartData();
  });
});
