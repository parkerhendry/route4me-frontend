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
    const BACKEND_URL = 'https://traxxisgps.duckdns.org/api';

    /**
     * Get current Geotab username using session
     */
    function getCurrentUsername() {
        return new Promise((resolve, reject) => {
            if (!api) {
                reject(new Error('Geotab API not initialized'));
                return;
            }
            
            api.getSession(function(session) {
                console.log('session:', session);
                if (session && session.userName) {
                    resolve(session.userName);
                } else {
                    reject(new Error('Unable to get username from session'));
                }
            });
        });
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
        console.log('Validating user credentials...');
        
        try {
            const username = await getCurrentUsername();
            
            if (!username) {
                showAlert('Unable to get Geotab username. Please refresh the page.', 'danger');
                return;
            }

            console.log('Current username:', username);
            
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

            console.log('User validation response:', data);
            
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
            <div class="driver-selection-item border rounded p-3 mb-3">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" value="${driver.member_id}" 
                        id="driver-${driver.member_id}" onchange="updateDriverSelection()">
                    <label class="form-check-label" for="driver-${driver.member_id}">
                        <div class="driver-info">
                            <strong>${driver.member_first_name} ${driver.member_last_name}</strong>
                            <small class="text-muted d-block">${driver.member_email}</small>
                        </div>
                    </label>
                </div>
                <div class="starting-location-selection mt-2" id="location-${driver.member_id}" style="display: none;">
                    <label class="form-label"><strong>Starting Location:</strong></label>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="location-${driver.member_id}" 
                            value="hq" id="hq-${driver.member_id}" onchange="updateDriverSelection()">
                        <label class="form-check-label" for="hq-${driver.member_id}">
                            <i class="fas fa-building me-2"></i>HQ
                        </label>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="location-${driver.member_id}" 
                            value="home" id="home-${driver.member_id}" onchange="updateDriverSelection()">
                        <label class="form-check-label" for="home-${driver.member_id}">
                            <i class="fas fa-home me-2"></i>Home
                        </label>
                    </div>
                </div>
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
            const driverId = checkbox.value;
            const locationDiv = document.getElementById(`location-${driverId}`);
            
            if (checkbox.checked) {
                // Show location selection
                if (locationDiv) {
                    locationDiv.style.display = 'block';
                }
                
                // Get selected location
                const locationRadios = document.querySelectorAll(`input[name="location-${driverId}"]:checked`);
                const selectedLocation = locationRadios.length > 0 ? locationRadios[0].value : null;
                
                // Find driver info
                const driver = subDrivers.find(d => d.member_id == driverId);
                if (driver) {
                    selectedDrivers.push({
                        ...driver,
                        starting_location: selectedLocation
                    });
                }
            } else {
                // Hide location selection
                if (locationDiv) {
                    locationDiv.style.display = 'none';
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
            // Enable button only if all selected drivers have a starting location
            const allHaveLocation = selectedDrivers.every(driver => driver.starting_location);
            proceedBtn.disabled = selectedDrivers.length === 0 || !allHaveLocation;
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
                
                // Validate driver assignments
                await validateDriverAssignments();
            } else {
                throw new Error('File processing failed');
            }
            
        } catch (error) {
            console.error('File upload error:', error);
            showAlert(`File upload failed: ${error.message}`, 'danger');
        }
    }

    // New function to validate driver assignments
    async function validateDriverAssignments() {
        try {
            const driverEmails = selectedDrivers.map(driver => driver.member_email);
            
            const response = await fetch(`${BACKEND_URL}/validate-driver-assignments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    selected_drivers: driverEmails,
                    addresses: uploadedAddresses
                })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                if (data.fully_covered) {
                    showAlert('All problem types can be handled by selected drivers', 'success');
                } else {
                    showAlert(`Warning: ${data.uncovered_types.length} problem types cannot be handled by selected drivers`, 'warning');
                    console.log('Uncovered problem types:', data.uncovered_types);
                }
                
                // Show coverage details
                showCoverageDetails(data.coverage);
            }
            
        } catch (error) {
            console.error('Driver assignment validation error:', error);
            // Don't show error - this is just for information
        }
    }

    // New function to show coverage details
    function showCoverageDetails(coverage) {
        const fileInfo = document.getElementById('fileInfo');
        if (!fileInfo) return;
        
        let coverageHtml = '<div class="mt-3"><h6>Problem Type Coverage:</h6>';
        
        for (const [problemType, info] of Object.entries(coverage)) {
            const badgeClass = info.count > 0 ? 'bg-success' : 'bg-danger';
            coverageHtml += `
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span>${problemType} (${info.addresses_count} addresses)</span>
                    <span class="badge ${badgeClass}">${info.count} drivers</span>
                </div>
            `;
        }
        
        coverageHtml += '</div>';
        
        // Add to file info
        const existingCoverage = fileInfo.querySelector('.coverage-details');
        if (existingCoverage) {
            existingCoverage.innerHTML = coverageHtml;
        } else {
            fileInfo.insertAdjacentHTML('beforeend', `<div class="coverage-details">${coverageHtml}</div>`);
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
                <div class="driver-summary-item mb-2">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <i class="fas fa-user me-2"></i>
                            <strong>${driver.member_first_name} ${driver.member_last_name}</strong>
                        </div>
                        <div class="text-end">
                            <small class="text-muted d-block">${driver.member_email}</small>
                            <span class="badge bg-primary">
                                <i class="fas fa-${driver.starting_location === 'hq' ? 'building' : 'home'} me-1"></i>
                                ${driver.starting_location?.toUpperCase()}
                            </span>
                        </div>
                    </div>
                </div>
            `).join('');
            selectedDriversList.innerHTML = driversHtml;
        }
        
        if (addressesSummary) {
            // Group addresses by problem type
            const problemTypes = {};
            uploadedAddresses.forEach(addr => {
                const type = addr.problem_type;
                if (!problemTypes[type]) {
                    problemTypes[type] = 0;
                }
                problemTypes[type]++;
            });
            
            let summaryHtml = `
                <div class="addresses-summary">
                    <div class="mb-2">
                        <i class="fas fa-map-marker-alt me-2"></i>
                        <strong>${uploadedAddresses.length} total addresses</strong>
                    </div>
                    <div class="problem-types">
                        <h6>Problem Types:</h6>
            `;
            
            for (const [type, count] of Object.entries(problemTypes)) {
                summaryHtml += `
                    <div class="d-flex justify-content-between">
                        <span>${type}</span>
                        <span class="badge bg-secondary">${count}</span>
                    </div>
                `;
            }
            
            summaryHtml += '</div></div>';
            addressesSummary.innerHTML = summaryHtml;
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
        
        // Validate all drivers have starting locations
        const driversWithoutLocation = selectedDrivers.filter(driver => !driver.starting_location);
        if (driversWithoutLocation.length > 0) {
            showAlert('Please select starting locations for all drivers.', 'warning');
            return;
        }
        
        try {
            const username = await getCurrentUsername();
            
            if (!username) {
                showAlert('Unable to get username. Please refresh the page.', 'danger');
                return;
            }
            
            showAlert('Creating routes...', 'info');
            
            // Format drivers for API
            const formattedDrivers = selectedDrivers.map(driver => ({
                email: driver.member_email,
                starting_location: driver.starting_location
            }));
            
            const response = await fetch(`${BACKEND_URL}/create-routes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    selected_drivers: formattedDrivers,
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
        
        let resultsHtml = `
            <div class="alert alert-success mb-3">
                <h6><i class="fas fa-check-circle me-2"></i>Route Creation Summary</h6>
                <p><strong>Total Routes Created:</strong> ${data.total_routes}</p>
            </div>
        `;
        
        // Show individual route results
        if (data.created_routes && data.created_routes.length > 0) {
            resultsHtml += '<div class="route-results">';
            
            data.created_routes.forEach(route => {
                if (route.status === 'success') {
                    resultsHtml += `
                        <div class="card mb-2">
                            <div class="card-body">
                                <h6 class="card-title">
                                    <i class="fas fa-route me-2"></i>${route.driver}
                                    <span class="badge bg-success ms-2">Success</span>
                                </h6>
                                <p class="card-text">
                                    <strong>Starting Location:</strong> ${route.starting_location?.toUpperCase()}<br>
                                    <strong>Addresses:</strong> ${route.addresses_count}<br>
                                    <strong>Route ID:</strong> ${route.route_id || 'N/A'}
                                </p>
                            </div>
                        </div>
                    `;
                } else {
                    resultsHtml += `
                        <div class="card mb-2">
                            <div class="card-body">
                                <h6 class="card-title">
                                    <i class="fas fa-exclamation-triangle me-2"></i>${route.driver}
                                    <span class="badge bg-danger ms-2">Failed</span>
                                </h6>
                                <p class="card-text text-danger">
                                    <strong>Error:</strong> ${route.error}
                                </p>
                            </div>
                        </div>
                    `;
                }
            });
            
            resultsHtml += '</div>';
        }
        
        resultsDiv.innerHTML = resultsHtml;
        resultsDiv.classList.remove('hidden');
    }

    // New function to get available drivers from backend
    async function getAvailableDrivers() {
        try {
            const response = await fetch(`${BACKEND_URL}/get-drivers`);
            const data = await response.json();
            
            if (response.ok && data.success) {
                return data.drivers;
            } else {
                console.error('Failed to get available drivers:', data.error);
                return [];
            }
        } catch (error) {
            console.error('Error fetching available drivers:', error);
            return [];
        }
    }

    // Add the styles to the page
    function addAdditionalStyles() {
        const style = document.createElement('style');
        style.textContent = additionalStyles;
        document.head.appendChild(style);
    }

    function initializeAppWithStyles() {
        addAdditionalStyles();
        initializeApp();
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
            initializeAppWithStyles();
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