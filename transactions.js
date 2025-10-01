
let currentView = localStorage.getItem('transactionView') || 'daily';

function clearFormInputs() {
  document.getElementById('description').value = '';
  document.getElementById('amount').value = '';
  document.getElementById('type').value = '';
  document.getElementById('date').value = DateTime.now().setZone(userTimezone).toISODate();
  document.getElementById('edit-index').value = '-1';
}

function groupTransactionsByPeriod() {
  const grouped = {};
  transactions.forEach(t => {
    const date = DateTime.fromISO(t.date, { zone: userTimezone });
    let key;
    if (currentView === 'daily') {
      key = date.toISODate();
    } else if (currentView === 'monthly') {
      key = date.startOf('month').toISODate();
    } else if (currentView === 'yearly') {
      key = date.startOf('year').toISODate();
    }
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(t);
  });
  return grouped;
}

function calculateSummary(transactions) {
  const income = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const balance = income - expense;
  return { income, expense, balance };
}

function renderSummary() {
  const summaryElement = document.getElementById('transaction-summary');
  const { income, expense, balance } = calculateSummary(transactions);
  const summaryHTML = `
        <div class="period-summary">
            <div class="summary-values">
                <div class="metric">
                    <span class="metric-label income-label">Income</span>
                    <span class="metric-value income">Rp${formatter.format(income)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label expense-label">Expense</span>
                    <span class="metric-value expense">Rp${formatter.format(expense)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label balance-label">Balance</span>
                    <span class="metric-value balance">Rp${formatter.format(balance)}</span>
                </div>
            </div>
        </div>
    `;
  summaryElement.innerHTML = summaryHTML;
}

function renderTransactions() {
  const transactionList = document.getElementById('transaction-list');
  transactionList.innerHTML = '';
  const grouped = groupTransactionsByPeriod();
  
  // Sort periods in descending order (most recent first)
  Object.keys(grouped)
    .sort((a, b) => DateTime.fromISO(b) - DateTime.fromISO(a))
    .forEach(key => {
      const periodTransactions = grouped[key];
      const periodLabel = currentView === 'daily' ?
        DateTime.fromISO(key).toLocaleString(DateTime.DATE_FULL) :
        currentView === 'monthly' ?
        DateTime.fromISO(key).toFormat('MMMM yyyy') :
        DateTime.fromISO(key).toFormat('yyyy');
      
      // Calculate period summary
      const { income, expense, balance } = calculateSummary(periodTransactions);
      
      // Create period container
      const periodContainer = document.createElement('div');
      periodContainer.className = 'period-container';
      
// Add period header with integrated summary
const header = document.createElement('h3');
header.className = 'period-header';
header.innerHTML = `
  <span class="period-label">${periodLabel}</span>
  <div class="summary-values">
    <div class="metric income-metric">
      <span class="metric-label income-label">Income</span>
      <span class="metric-value income">Rp${formatter.format(income)}</span>
    </div>
    <div class="metric expense-metric">
      <span class="metric-label expense-label">Expense</span>
      <span class="metric-value expense">Rp${formatter.format(expense)}</span>
    </div>
    <div class="metric balance-metric">
      <span class="metric-label balance-label">Balance</span>
      <span class="metric-value balance">Rp${formatter.format(balance)}</span>
    </div>
  </div>
`;
      periodContainer.appendChild(header);
      
      // Add transactions for this period
      periodTransactions.forEach((transaction, index) => {
        const globalIndex = transactions.indexOf(transaction);
        const formattedDate = DateTime.fromISO(transaction.date, { zone: userTimezone }).toLocaleString(DateTime.DATE_SHORT);
        const item = document.createElement('div');
        item.className = `transaction-item ${transaction.type}`;
        item.setAttribute('data-index', globalIndex);
        item.innerHTML = `
          <span class="description-item">${transaction.description}</span>
          <span class="amount-item">Rp${formatter.format(transaction.amount)}</span>
          <span class="date-item">${formattedDate}</span>
          <button class="edit-btn" onclick="editTransaction(${globalIndex})" aria-label="Edit ${transaction.description}">
            <span class="material-symbols-outlined">edit</span>
          </button>
          <button class="delete-btn" onclick="deleteTransaction(${globalIndex})" aria-label="Delete ${transaction.description}">
            <span class="material-symbols-outlined">delete</span>
          </button>
        `;
        periodContainer.appendChild(item);
      });
      
      // Append the period container to the transaction list
      transactionList.appendChild(periodContainer);
    });
  
  renderSummary();
}

function addTransaction(e) {
  e.preventDefault();
  const description = document.getElementById('description').value;
  const amount = parseFloat(document.getElementById('amount').value);
  const type = document.getElementById('type').value;
  const date = document.getElementById('date').value;
  const editIndex = parseInt(document.getElementById('edit-index').value);
  
  if (description.trim() === '' || isNaN(amount) || amount <= 0 || !date || !type) {
    alert('Please enter a valid description, amount, type, and date.');
    return;
  }
  
  const transaction = { description, amount, type, date, isEditing: false };
  if (editIndex >= 0) {
    transactions[editIndex] = transaction;
  } else {
    transactions.unshift(transaction);
  }
  
  localStorage.setItem('transactions', JSON.stringify(transactions));
  closeModal();
  renderTransactions();
  window.dispatchEvent(new Event('storage'));
}

function editTransaction(index) {
  openModal(index);
}

function deleteTransaction(index) {
  if (confirm(`Are you sure you want to delete "${transactions[index].description}"?`)) {
    transactions.splice(index, 1);
    localStorage.setItem('transactions', JSON.stringify(transactions));
    renderTransactions();
    window.dispatchEvent(new Event('storage'));
  }
}

function openModal(editIndex = -1) {
  const modal = document.getElementById('transaction-modal');
  const modalTitle = document.getElementById('modal-title');
  const submitBtn = document.getElementById('form-submit-btn');
  const editIndexInput = document.getElementById('edit-index');
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
  
  if (editIndex >= 0) {
    const transaction = transactions[editIndex];
    modalTitle.textContent = 'Edit Transaction';
    submitBtn.textContent = 'Save';
    document.getElementById('description').value = transaction.description;
    document.getElementById('amount').value = transaction.amount;
    document.getElementById('type').value = transaction.type;
    document.getElementById('date').value = transaction.date;
    editIndexInput.value = editIndex;
  } else {
    modalTitle.textContent = 'Add Transaction';
    submitBtn.textContent = 'Add Transaction';
    clearFormInputs();
  }
}

function closeModal() {
  const modal = document.getElementById('transaction-modal');
  modal.style.display = 'none';
  document.body.classList.remove('modal-open');
  clearFormInputs();
}

function setView(view) {
  const validViews = ['daily', 'monthly', 'yearly'];
  if (!validViews.includes(view)) {
    view = 'daily';
  }
  currentView = view;
  localStorage.setItem('transactionView', view);
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  renderTransactions();
}

document.addEventListener('DOMContentLoaded', () => {
  // Ensure valid view is loaded from localStorage
  const validViews = ['daily', 'monthly', 'yearly'];
  if (!validViews.includes(currentView)) {
    currentView = 'daily';
    localStorage.setItem('transactionView', 'daily');
  }
  // Set active view button and render transactions
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === currentView);
  });
  renderTransactions();
  document.getElementById('transaction-form').addEventListener('submit', addTransaction);
  document.querySelector('.add-btn').addEventListener('click', () => openModal());
  document.querySelector('.close-btn').addEventListener('click', closeModal);
  document.getElementById('transaction-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('transaction-modal').style.display === 'flex') {
      closeModal();
    }
  });
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
});
