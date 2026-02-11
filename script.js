let tokenClient;
let gapiInited = false;
let gisInited = false;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize modal
    const modal = document.getElementById('item-modal');
    const addBtn = document.getElementById('add-item-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const span = document.getElementsByClassName('close')[0];
    const form = document.getElementById('item-form');
    
    addBtn.onclick = function() {
        document.getElementById('modal-title').textContent = 'Add New Item';
        document.getElementById('item-form').reset();
        document.getElementById('item-id').value = '';
        modal.style.display = 'block';
    }
    
    refreshBtn.onclick = function() {
        if (gapiInited && gisInited) {
            listInventoryItems();
        }
    }
    
    span.onclick = function() {
        modal.style.display = 'none';
    }
    
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }
    
    form.onsubmit = function(event) {
        event.preventDefault();
        saveItem();
    }
    
    // Initialize GAPI
    gapiLoaded();
    // Initialize GIS
    gisLoaded();
});

function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: CONFIG.API_KEY,
        discoveryDocs: CONFIG.DISCOVERY_DOCS,
    });
    gapiInited = true;
    maybeEnableButtons();
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: '', // defined later
    });
    gisInited = true;
    maybeEnableButtons();
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('add-item-btn').style.visibility = 'visible';
        document.getElementById('refresh-btn').style.visibility = 'visible';
        listInventoryItems();
    }
}

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        listInventoryItems();
    };
    
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

function listInventoryItems() {
    if (gapi.client.getToken() === null) {
        handleAuthClick();
        return;
    }
    
    gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: 'Sheet1!A:G', // Adjust range based on your sheet
    }).then(function(response) {
        const range = response.result;
        const values = range.values;
        
        if (values && values.length > 0) {
            const tableBody = document.getElementById('inventory-data');
            tableBody.innerHTML = '';
            
            // Skip header row if it exists
            const startRow = values[0][0] === 'Product ID' ? 1 : 0;
            
            for (let i = startRow; i < values.length; i++) {
                const row = values[i];
                const rowElement = document.createElement('tr');
                
                // Create cells for each column
                for (let j = 0; j < row.length; j++) {
                    const cell = document.createElement('td');
                    cell.textContent = row[j];
                    rowElement.appendChild(cell);
                }
                
                // Add action buttons
                const actionsCell = document.createElement('td');
                actionsCell.innerHTML = `
                    <button class="action-btn edit-btn" data-id="${row[0]}">Edit</button>
                    <button class="action-btn delete-btn" data-id="${row[0]}">Delete</button>
                `;
                rowElement.appendChild(actionsCell);
                
                tableBody.appendChild(rowElement);
            }
            
            // Add event listeners to edit and delete buttons
            document.querySelectorAll('.edit-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const itemId = this.getAttribute('data-id');
                    editItem(itemId);
                });
            });
            
            document.querySelectorAll('.delete-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const itemId = this.getAttribute('data-id');
                    deleteItem(itemId);
                });
            });
        } else {
            document.getElementById('inventory-data').innerHTML = '<tr><td colspan="7">No data found</td></tr>';
        }
    }, function(response) {
        console.error('Error: ' + response.result.error.message);
        handleAuthClick();
    });
}

function saveItem() {
    if (gapi.client.getToken() === null) {
        handleAuthClick();
        return;
    }
    
    const itemId = document.getElementById('item-id').value;
    const productName = document.getElementById('product-name').value;
    const description = document.getElementById('description').value;
    const quantity = document.getElementById('quantity').value;
    const price = document.getElementById('price').value;
    const supplier = document.getElementById('supplier').value;
    
    if (itemId) {
        // Update existing item
        updateItem(itemId, productName, description, quantity, price, supplier);
    } else {
        // Add new item
        addItem(productName, description, quantity, price, supplier);
    }
}

function addItem(productName, description, quantity, price, supplier) {
    // Generate a new ID (in a real app, you might want a more robust ID generation)
    const newId = 'PRD' + Date.now();
    
    gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: 'Sheet1!A:G',
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [[newId, productName, description, quantity, price, supplier, new Date().toLocaleDateString()]]
        }
    }).then(function(response) {
        document.getElementById('item-modal').style.display = 'none';
        listInventoryItems();
    }, function(response) {
        console.error('Error: ' + response.result.error.message);
    });
}

function updateItem(itemId, productName, description, quantity, price, supplier) {
    // First, find the row number of the item
    gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: 'Sheet1!A:G',
    }).then(function(response) {
        const range = response.result;
        const values = range.values;
        
        if (values && values.length > 0) {
            let rowIndex = -1;
            // Skip header row if it exists
            const startRow = values[0][0] === 'Product ID' ? 1 : 0;
            
            for (let i = startRow; i < values.length; i++) {
                if (values[i][0] === itemId) {
                    rowIndex = i + 1; // +1 because sheets are 1-indexed
                    break;
                }
            }
            
            if (rowIndex > 0) {
                // Update the row
                gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: CONFIG.SPREADSHEET_ID,
                    range: `Sheet1!A${rowIndex}:G${rowIndex}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [[itemId, productName, description, quantity, price, supplier, new Date().toLocaleDateString()]]
                    }
                }).then(function(response) {
                    document.getElementById('item-modal').style.display = 'none';
                    listInventoryItems();
                }, function(response) {
                    console.error('Error: ' + response.result.error.message);
                });
            }
        }
    }, function(response) {
        console.error('Error: ' + response.result.error.message);
    });
}

function editItem(itemId) {
    // Find the item data
    gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: 'Sheet1!A:G',
    }).then(function(response) {
        const range = response.result;
        const values = range.values;
        
        if (values && values.length > 0) {
            // Skip header row if it exists
            const startRow = values[0][0] === 'Product ID' ? 1 : 0;
            
            for (let i = startRow; i < values.length; i++) {
                if (values[i][0] === itemId) {
                    const row = values[i];
                    
                    // Fill the form with item data
                    document.getElementById('modal-title').textContent = 'Edit Item';
                    document.getElementById('item-id').value = row[0];
                    document.getElementById('product-name').value = row[1];
                    document.getElementById('description').value = row[2];
                    document.getElementById('quantity').value = row[3];
                    document.getElementById('price').value = row[4];
                    document.getElementById('supplier').value = row[5];
                    
                    // Show the modal
                    document.getElementById('item-modal').style.display = 'block';
                    break;
                }
            }
        }
    }, function(response) {
        console.error('Error: ' + response.result.error.message);
    });
}

function deleteItem(itemId) {
    if (confirm('Are you sure you want to delete this item?')) {
        // First, find the row number of the item
        gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: 'Sheet1!A:G',
        }).then(function(response) {
            const range = response.result;
            const values = range.values;
            
            if (values && values.length > 0) {
                let rowIndex = -1;
                // Skip header row if it exists
                const startRow = values[0][0] === 'Product ID' ? 1 : 0;
                
                for (let i = startRow; i < values.length; i++) {
                    if (values[i][0] === itemId) {
                        rowIndex = i + 1; // +1 because sheets are 1-indexed
                        break;
                    }
                }
                
                if (rowIndex > 0) {
                    // Delete the row
                    gapi.client.sheets.spreadsheets.batchUpdate({
                        spreadsheetId: CONFIG.SPREADSHEET_ID,
                        resource: {
                            requests: [
                                {
                                    deleteDimension: {
                                        range: {
                                            sheetId: 0, // Assuming first sheet
                                            dimension: 'ROWS',
                                            startIndex: rowIndex - 1, // 0-indexed
                                            endIndex: rowIndex // Exclusive
                                        }
                                    }
                                }
                            ]
                        }
                    }).then(function(response) {
                        listInventoryItems();
                    }, function(response) {
                        console.error('Error: ' + response.result.error.message);
                    });
                }
            }
        }, function(response) {
            console.error('Error: ' + response.result.error.message);
        });
    }
}