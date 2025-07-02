/**
 * Route4Me Integration Add-in
 * @returns {{initialize: Function, focus: Function, blur: Function}}
 */
geotab.addin.route4me = function () {
    'use strict';

    let api;
    let state;
    let elAddin;
    let currentUser = null;
    let subDrivers = [];
    let selectedDrivers = [];
    let uploadedAddresses = [];
    let currentStep = 1;
    
    // Backend URL - Update this to your EC2 instance URL
    const BACKEND_URL = 'http://traxxisgps.duckdns.org/api';

    /**
     * Get current Geotab username
     */
    function getCurrentUsername() {
        if (state && state.userName) {
            return state.userName;
        }
        return null;
    }

    /**
     * Initialize the application
     */
    function initializeApp() {
        console.log('Initializing Route4Me app...');
        resetApplication();
        validateUser();
    }

    /**
     * Reset application to initial state
     */
    function resetApplication() {
        currentUser = null;
        subDrivers = [];
        selectedDrivers = [];
        uploadedAddresses = [];
        currentStep = 1;
        
        // Reset UI
        updateStepIndicator(1);
        showCard('userValidationCard');
        hideCard('driverSelectionCard');
        hideCard('addressUploadCard');
        hideCard('routeCreationCard');
        
        // Reset file input
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.value = '';
        }
        
        // Clear alerts
        const alertContainer = document.getElementById('alertContainer');
        if (alertContainer) {
            alertContainer.innerHTML = '';
        }
    }

    /**
     * Validate user credentials with Route4Me
     */
    async function validateUser() {
        const username = getCurrentUsername();
        
        if (!username) {
            showAlert('Unable to get Geotab username. Please refresh the page.', 'danger');
            return;
        }
        
        try {
            showLoadingInCard('userValidationCard', 'Validating user credentials...');
            
            const response = await fetch(`${BACKEND_URL}/validate-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Validation failed');
            }
            
            if (data.success) {
                currentUser = data.user;
                subDrivers = data.sub_drivers || [];
                
                showAlert(`Welcome ${currentUser.member_first_name}! Found ${subDrivers.length} drivers.`, 'success');
                
                // Show validation success in card
                showValidationSuccess();
                
                // Proceed to driver selection
                setTimeout(() => {
                    proceedToDriverSelection();
                }, 2000);
            } else {
                throw new Error('User validation failed');
            }
            
        } catch (error) {
            console.error('User validation error:', error);
            showAlert(`User validation failed: ${error.message}`, 'danger');
            showValidationError(error.message);
        }
    }

    /**
     * Show validation success in card
     */
    function showValidationSuccess() {
        const content = document.getElementById('userValidationContent');
        if (!content) return;
        
        content.innerHTML = `
            <div class="text-center">
                <i class="fas fa-check-circle text-success" style="font-size: 3rem;"></i>
                <h5 class="mt-3">User Validated Successfully!</h5>
                <p class="text-muted">
                    Welcome ${currentUser.member_first_name} ${currentUser.member_last_name}<br>
                    Found ${subDrivers.length} drivers in your account
                </p>
            </div>
        `;
    }

    /**
     * Show validation error in card
     */
    function showValidationError(errorMessage) {
        const content = document.getElementById('userValidationContent');
        if (!content) return;
        
        content.innerHTML = `
            <div class="text-center">
                <i class="fas fa-exclamation-triangle text-danger" style="font-size: 3rem;"></i>
                <h5 class="mt-3">Validation Failed</h5>
                <p class="text-muted">${errorMessage}</p>
                <button class="btn btn-primary mt-2" onclick="initializeApp()">
                    <i class="fas fa-redo me-2"></i>Try Again
                </button>
            </div>
        `;
    }

    /**
     * Proceed to driver selection step
     */
    function proceedToDriverSelection() {
        if (subDrivers.length === 0) {
            showAlert('No drivers found in your Route4Me account.', 'warning');
            return;
        }
        
        currentStep = 2;
        updateStepIndicator(2);
        hideCard('userValidationCard');
        showCard('driverSelectionCard');
        
        renderDriverList();
    }

    /**
     * Render the driver selection list
     */
    function renderDriverList() {
        const driverList = document.getElementById('driverList');
        if (!driverList) return;
        
        const driversHtml = subDrivers.map(driver => `
            <div class="form-check driver-item">
                <input class="form-check-input" type="checkbox" value="${driver.member_id}" 
                       id="driver-${driver.member_id}" onchange="updateDriverSelection()">
                <label class="form-check-label" for="driver-${driver.member_id}">
                    <div class="driver-info">
                        <strong>${driver.member_first_name} ${driver.member_last_name}</strong>
                        <small class="text-muted d-block">${driver.member_email}</small>
                    </div>
                </label>
            </div>
        `).join('');
        
        driverList.innerHTML = driversHtml;
    }

    /**
     * Update driver selection
     */
    function updateDriverSelection() {
        const checkboxes = document.querySelectorAll('#driverList input[type="checkbox"]');
        selectedDrivers = [];
        
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                const driverId = checkbox.value;
                const driver = subDrivers.find(d => d.member_id == driverId);
                if (driver) {
                    selectedDrivers.push(driver);
                }
            }
        });
        
        // Update UI
        const driverCount = document.getElementById('driverCount');
        const proceedBtn = document.getElementById('proceedToUploadBtn');
        
        if (driverCount) {
            driverCount.textContent = selectedDrivers.length;
        }
        
        if (proceedBtn) {
            proceedBtn.disabled = selectedDrivers.length === 0;
        }
    }

    /**
     * Proceed to address upload step
     */
    function proceedToAddressUpload() {
        if (selectedDrivers.length === 0) {
            showAlert('Please select at least one driver.', 'warning');
            return;
        }
        
        currentStep = 3;
        updateStepIndicator(3);
        hideCard('driverSelectionCard');
        showCard('addressUploadCard');
        
        setupFileUpload();
    }

    /**
     * Setup file upload functionality
     */
    function setupFileUpload() {
        const fileUploadArea = document.getElementById('fileUploadArea');
        const fileInput = document.getElementById('fileInput');
        
        if (!fileUploadArea || !fileInput) return;
        
        // Click to browse
        fileUploadArea.addEventListener('click', () => {
            fileInput.click();
        });
        
        // Drag and drop
        fileUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileUploadArea.classList.add('drag-over');
        });
        
        fileUploadArea.addEventListener('dragleave', () => {
            fileUploadArea.classList.remove('drag-over');
        });
        
        fileUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            fileUploadArea.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileUpload(files[0]);
            }
        });
        
        // File input change
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleFileUpload(file);
            }
        });
    }

    /**
     * Handle file upload
     */
    async function handleFileUpload(file) {
        if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
            showAlert('Please upload an Excel file (.xlsx or .xls)', 'danger');
            return;
        }
        
        try {
            showAlert('Processing Excel file...', 'info');
            
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch(`${BACKEND_URL}/upload-addresses`, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'File upload failed');
            }
            
            if (data.success) {
                uploadedAddresses = data.addresses;
                showAlert(`Successfully loaded ${data.count} addresses`, 'success');
                showFileInfo(file.name, data.count);
            } else {
                throw new Error('File processing failed');
            }
            
        } catch (error) {
            console.error('File upload error:', error);
            showAlert(`File upload failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Show file information
     */
    function showFileInfo(fileName, addressCount) {
        const fileInfo = document.getElementById('fileInfo');
        const fileDetails = document.getElementById('fileDetails');
        
        if (fileInfo && fileDetails) {
            fileDetails.textContent = `File: ${fileName} - ${addressCount} addresses found`;
            fileInfo.classList.remove('hidden');
        }
    }

    /**
     * Proceed to route creation step
     */
    function proceedToRouteCreation() {
        if (uploadedAddresses.length === 0) {
            showAlert('Please upload addresses first.', 'warning');
            return;
        }
        
        currentStep = 4;
        updateStepIndicator(4);
        hideCard('addressUploadCard');
        showCard('routeCreationCard');
        
        showRouteSummary();
    }

    /**
     * Show route creation summary
     */
    function showRouteSummary() {
        const selectedDriversList = document.getElementById('selectedDriversList');
        const addressesSummary = document.getElementById('addressesSummary');
        
        if (selectedDriversList) {
            const driversHtml = selectedDrivers.map(driver => `
                <div class="driver-summary-item">
                    <i class="fas fa-user me-2"></i>
                    ${driver.member_first_name} ${driver.member_last_name}
                </div>
            `).join('');
            selectedDriversList.innerHTML = driversHtml;
        }
        
        if (addressesSummary) {
            addressesSummary.innerHTML = `
                <div class="addresses-summary">
                    <i class="fas fa-map-marker-alt me-2"></i>
                    ${uploadedAddresses.length} addresses ready for routing
                </div>
            `;
        }
    }

    /**
     * Create routes
     */
    async function createRoutes() {
        if (selectedDrivers.length === 0 || uploadedAddresses.length === 0) {
            showAlert('Please select drivers and upload addresses first.', 'warning');
            return;
        }
        
        const username = getCurrentUsername();
        if (!username) {
            showAlert('Unable to get username. Please refresh the page.', 'danger');
            return;
        }
        
        try {
            showAlert('Creating routes...', 'info');
            
            const response = await fetch(`${BACKEND_URL}/create-routes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    selected_drivers: selectedDrivers,
                    addresses: uploadedAddresses
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Route creation failed');
            }
            
            if (data.success) {
                showAlert('Routes created successfully!', 'success');
                showRouteCreationResults(data);
            } else {
                throw new Error('Route creation failed');
            }
            
        } catch (error) {
            console.error('Route creation error:', error);
            showAlert(`Route creation failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Show route creation results
     */
    function showRouteCreationResults(data) {
        const resultsDiv = document.getElementById('routeCreationResults');
        if (!resultsDiv) return;
        
        const resultsHtml = `
            <div class="alert alert-success">
                <h6><i class="fas fa-check-circle me-2"></i>Route Creation Summary</h6>
                <p><strong>Drivers:</strong> ${data.drivers_count}</p>
                <p><strong>Addresses:</strong> ${data.addresses_count}</p>
                <p class="mb-0">${data.message}</p>
            </div>
        `;
        
        resultsDiv.innerHTML = resultsHtml;
        resultsDiv.classList.remove('hidden');
    }

    /**
     * Update step indicator
     */
    function updateStepIndicator(activeStep) {
        for (let i = 1; i <= 4; i++) {
            const step = document.getElementById(`step${i}`);
            if (step) {
                if (i === activeStep) {
                    step.classList.add('active');
                } else if (i < activeStep) {
                    step.classList.add('completed');
                    step.classList.remove('active');
                } else {
                    step.classList.remove('active', 'completed');
                }
            }
        }
    }

    /**
     * Show/hide cards
     */
    function showCard(cardId) {
        const card = document.getElementById(cardId);
        if (card) {
            card.classList.remove('hidden');
        }
    }

    function hideCard(cardId) {
        const card = document.getElementById(cardId);
        if (card) {
            card.classList.add('hidden');
        }
    }

    /**
     * Show loading state in card
     */
    function showLoadingInCard(cardId, message) {
        const card = document.getElementById(cardId);
        if (!card) return;
        
        const content = card.querySelector('.card-body');
        if (content) {
            content.innerHTML = `
                <div class="text-center">
                    <div class="loading-spinner">
                        <div class="spinner-border" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p class="mt-2 mb-0">${message}</p>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Show alert messages
     */
    function showAlert(message, type = 'info') {
        const alertContainer = document.getElementById('alertContainer');
        if (!alertContainer) return;
        
        const alertId = 'alert-' + Date.now();
        
        const iconMap = {
            'success': 'check-circle',
            'danger': 'exclamation-triangle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        
        const alertHtml = `
            <div class="alert alert-${type} alert-dismissible fade show" id="${alertId}" role="alert">
                <i class="fas fa-${iconMap[type]} me-2"></i>
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        
        alertContainer.insertAdjacentHTML('beforeend', alertHtml);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            const alert = document.getElementById(alertId);
            if (alert && typeof bootstrap !== 'undefined' && bootstrap.Alert) {
                const bsAlert = new bootstrap.Alert(alert);
                bsAlert.close();
            }
        }, 5000);
    }

    /**
     * Expose global functions
     */
    window.initializeApp = initializeApp;
    window.updateDriverSelection = updateDriverSelection;
    window.proceedToAddressUpload = proceedToAddressUpload;
    window.proceedToRouteCreation = proceedToRouteCreation;
    window.createRoutes = createRoutes;

    return {
        /**
         * initialize() is called only once when the Add-In is first loaded.
         */
        initialize: function (freshApi, freshState, initializeCallback) {
            api = freshApi;
            state = freshState;

            elAddin = document.getElementById('route4meApp');

            if (state.translate) {
                state.translate(elAddin || '');
            }
            
            initializeCallback();
        },

        /**
         * focus() is called whenever the Add-In receives focus.
         */
        focus: function (freshApi, freshState) {
            api = freshApi;
            state = freshState;
            
            // Show main content
            if (elAddin) {
                elAddin.style.display = 'block';
            }
            
            // Initialize the app
            initializeApp();
        },

        /**
         * blur() is called whenever the user navigates away from the Add-In.
         */
        blur: function () {
            // Hide main content
            if (elAddin) {
                elAddin.style.display = 'none';
            }
        }
    };
};