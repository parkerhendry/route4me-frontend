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
        
        // Add search bar and select all controls
        const searchHtml = `
            <div class="driver-search mb-3">
                <div class="input-group">
                    <span class="input-group-text">
                        <i class="fas fa-search"></i>
                    </span>
                    <input type="text" class="form-control" id="driverSearch" 
                        placeholder="Search drivers by name or email..." 
                        onkeyup="filterDrivers()">
                </div>
            </div>
            <div class="driver-controls mb-3">
                <div class="row align-items-center">
                    <div class="col-md-6">
                        <div class="btn-group" role="group">
                            <button type="button" class="btn btn-outline-primary btn-sm" onclick="selectAllDrivers()">
                                <i class="fas fa-check-square me-2"></i>Select All
                            </button>
                            <button type="button" class="btn btn-outline-secondary btn-sm" onclick="deselectAllDrivers()">
                                <i class="fas fa-square me-2"></i>Deselect All
                            </button>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="text-end">
                            <small class="text-muted">
                                <span id="selectedCount">0</span> of <span id="totalCount">${subDrivers.length}</span> drivers selected
                            </small>
                        </div>
                    </div>
                </div>
            </div>
            <div id="driverListContainer">
        `;
        
        const driversHtml = subDrivers.map(driver => `
            <div class="driver-selection-item card mb-3" data-driver-name="${driver.member_first_name} ${driver.member_last_name}" data-driver-email="${driver.member_email}">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-md-6">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" value="${driver.member_id}" 
                                    id="driver-${driver.member_id}" onchange="updateDriverSelection()">
                                <label class="form-check-label" for="driver-${driver.member_id}">
                                    <div class="driver-info">
                                        <strong><i class="fas fa-user me-2"></i>${driver.member_first_name} ${driver.member_last_name}</strong>
                                        <div class="text-muted mt-1">
                                            <i class="fas fa-envelope me-1"></i>${driver.member_email}
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="starting-location-selection" id="location-${driver.member_id}" style="display: none;">
                                <label class="form-label fw-bold mb-2">
                                    <i class="fas fa-map-marker-alt me-1"></i>Starting Location:
                                </label>
                                <div class="btn-group w-100" role="group">
                                    <input type="radio" class="btn-check" name="location-${driver.member_id}" 
                                        value="hq" id="hq-${driver.member_id}" onchange="updateDriverSelection()">
                                    <label class="btn btn-outline-primary" for="hq-${driver.member_id}">
                                        <i class="fas fa-building me-2"></i>HQ
                                    </label>
                                    
                                    <input type="radio" class="btn-check" name="location-${driver.member_id}" 
                                        value="home" id="home-${driver.member_id}" onchange="updateDriverSelection()">
                                    <label class="btn btn-outline-primary" for="home-${driver.member_id}">
                                        <i class="fas fa-home me-2"></i>Home
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
        
        driverList.innerHTML = searchHtml + driversHtml + '</div>';
        
        // Update the total count
        updateDriverCounts();
    }

    // Move these functions to global scope so they can be called from HTML onclick handlers
    function filterDrivers() {
        const searchTerm = document.getElementById('driverSearch').value.toLowerCase();
        const driverItems = document.querySelectorAll('.driver-selection-item');
        
        driverItems.forEach(item => {
            const driverName = item.getAttribute('data-driver-name').toLowerCase();
            const driverEmail = item.getAttribute('data-driver-email').toLowerCase();
            
            if (driverName.includes(searchTerm) || driverEmail.includes(searchTerm)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
        
        // Update counts after filtering
        updateDriverCounts();
    }

    function selectAllDrivers() {
        const checkboxes = document.querySelectorAll('#driverList input[type="checkbox"]');
        
        checkboxes.forEach(checkbox => {
            const driverItem = checkbox.closest('.driver-selection-item');
            // Only select if the driver item is visible (not filtered out)
            if (driverItem && driverItem.style.display !== 'none') {
                checkbox.checked = true;
                
                // Show location selection and set default to HQ
                const driverId = checkbox.value;
                const locationDiv = document.getElementById(`location-${driverId}`);
                if (locationDiv) {
                    locationDiv.style.display = 'block';
                    // Set default location to HQ if not already selected
                    const locationRadios = document.querySelectorAll(`input[name="location-${driverId}"]`);
                    if (locationRadios.length > 0) {
                        const hqRadio = document.getElementById(`hq-${driverId}`);
                        if (hqRadio && !document.querySelector(`input[name="location-${driverId}"]:checked`)) {
                            hqRadio.checked = true;
                        }
                    }
                }
            }
        });
        
        updateDriverSelection();
    }

    function deselectAllDrivers() {
        const checkboxes = document.querySelectorAll('#driverList input[type="checkbox"]');
        
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
            
            // Hide location selection
            const driverId = checkbox.value;
            const locationDiv = document.getElementById(`location-${driverId}`);
            if (locationDiv) {
                locationDiv.style.display = 'none';
            }
            
            // Clear location selection
            const locationRadios = document.querySelectorAll(`input[name="location-${driverId}"]`);
            locationRadios.forEach(radio => radio.checked = false);
        });
        
        updateDriverSelection();
    }

    function updateDriverCounts() {
        const totalCountElement = document.getElementById('totalCount');
        const selectedCountElement = document.getElementById('selectedCount');
        
        if (totalCountElement && selectedCountElement) {
            const visibleDrivers = document.querySelectorAll('.driver-selection-item:not([style*="display: none"])');
            const selectedDrivers = document.querySelectorAll('#driverList input[type="checkbox"]:checked');
            
            totalCountElement.textContent = visibleDrivers.length;
            selectedCountElement.textContent = selectedDrivers.length;
        }
    }

    /**
     * Update driver selection (modified to include count updates)
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
        
        // Update counts
        updateDriverCounts();
        
        // Update the driver count badge
        const driverCountBadge = document.getElementById('driverCount');
        if (driverCountBadge) {
            driverCountBadge.textContent = selectedDrivers.length;
        }
        
        // Enable/disable proceed button
        const proceedBtn = document.getElementById('proceedToUploadBtn');
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
            //showAlert('Processing Excel file...', 'success');
            
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
                showAlert(`Successfully loaded ${data.count} addresses. Validating geocoding...`, 'success');
                
                // Validate addresses with geocoding
                await validateAddresses(data.addresses, file.name);
            } else {
                throw new Error('File processing failed');
            }
            
        } catch (error) {
            console.error('File upload error:', error);
            showAlert(`File upload failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Validate addresses by geocoding them
     */
    async function validateAddresses(addresses, fileName) {
        try {
            const username = await getCurrentUsername();
            
            if (!username) {
                showAlert('Unable to get username. Please refresh the page.', 'danger');
                return;
            }
            
            // Start validation job
            showLoadingIndicator('Starting address validation...');
            
            const response = await fetch(`${BACKEND_URL}/validate-addresses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    addresses: addresses
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                hideLoadingIndicator();
                throw new Error(data.error || 'Address validation failed to start');
            }
            
            if (data.success) {
                // Poll for job status
                await pollValidationStatus(data.job_id, fileName);
            } else {
                hideLoadingIndicator();
                throw new Error('Address validation failed to start');
            }
            
        } catch (error) {
            hideLoadingIndicator();
            console.error('Address validation error:', error);
            showAlert(`Address validation failed: ${error.message}`, 'danger');
        }
    }

    async function pollValidationStatus(jobId, fileName, maxWaitMinutes = 10) {
        const startTime = Date.now();
        const maxWaitTime = maxWaitMinutes * 60 * 1000; // Convert to milliseconds
        
        try {
            while (Date.now() - startTime < maxWaitTime) {
                const response = await fetch(`${BACKEND_URL}/validation-status/${jobId}`);
                
                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error('Validation job not found or expired');
                    }
                    throw new Error('Failed to check validation status');
                }
                
                const jobInfo = await response.json();
                
                // Update loading indicator with progress
                if (jobInfo.message && jobInfo.progress !== undefined) {
                    showLoadingIndicator(`${jobInfo.message} (${jobInfo.progress}%)`);
                }
                
                if (jobInfo.status === 'completed') {
                    hideLoadingIndicator();
                    
                    if (jobInfo.result && jobInfo.result.success) {
                        const result = jobInfo.result;
                        
                        if (result.invalid_count > 0) {
                            showAlert(`${result.invalid_count} addresses need correction. Please review and correct them.`, 'warning');
                            showAddressValidationForm(result.valid_addresses, result.invalid_addresses, fileName);
                        } else {
                            uploadedAddresses = result.valid_addresses;
                            showAlert(`All ${result.valid_count} addresses validated successfully!`, 'success');
                            showFileInfo(fileName, result.valid_count);
                            await validateDriverAssignments();
                        }
                    } else {
                        throw new Error('Validation completed but returned no results');
                    }
                    return;
                    
                } else if (jobInfo.status === 'failed') {
                    hideLoadingIndicator();
                    throw new Error(jobInfo.error || 'Validation failed');
                }
                
                // Wait before next poll (2 seconds)
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // Timeout reached
            hideLoadingIndicator();
            throw new Error(`Validation timed out after ${maxWaitMinutes} minutes`);
            
        } catch (error) {
            hideLoadingIndicator();
            console.error('Validation polling error:', error);
            showAlert(`Address validation failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Show address validation form for invalid addresses
     */
    function showAddressValidationForm(validAddresses, invalidAddresses, fileName) {
        const fileInfo = document.getElementById('fileInfo');
        if (!fileInfo) return;
        
        // Hide the file upload area and instruction text
        const fileUploadArea = document.getElementById('fileUploadArea');
        if (fileUploadArea) {
            fileUploadArea.style.display = 'none';
        }
        
        // Hide the instruction text paragraph
        const instructionText = document.querySelector('#addressUploadCard .card-body > p.text-muted');
        if (instructionText) {
            instructionText.style.display = 'none';
        }
        
        fileInfo.classList.remove('hidden');
        
        const validCount = validAddresses.length;
        const invalidCount = invalidAddresses.length;
        
        // Replace the entire fileInfo content with ONLY the validation form (no success alert)
        let formHtml = `
            <div class="address-validation-section">
                <div class="alert alert-warning">
                    <h6><i class="fas fa-exclamation-triangle me-2"></i>Address Validation Results</h6>
                    <p>
                        <strong>File:</strong> ${fileName}<br>
                        <strong>Valid Addresses:</strong> ${validCount}<br>
                        <strong>Addresses Needing Attention:</strong> ${invalidCount}
                    </p>
                    <p class="mb-0">
                        <strong>Route4Me is not fully confident in the location of these addresses, could you be more specific?</strong>
                    </p>
                </div>
                
                <div class="invalid-addresses-form">
                    <h6>Please review the following addresses:</h6>
                    <div class="invalid-addresses-list">
        `;
        
        invalidAddresses.forEach((address, index) => {
            formHtml += `
                <div class="invalid-address-item card mb-3">
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6 class="card-title">${address.builder_name} - ${address.problem_type}</h6>
                                <p class="text-muted mb-2">
                                    <strong>Address:</strong> ${address.address}<br>
                                    <strong>Confidence:</strong> ${address.confidence || 'Low confidence'}
                                </p>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">More Specific Address (Optional):</label>
                                <input type="text" class="form-control corrected-address" 
                                    id="corrected-${index}" 
                                    value="${address.address}"
                                    placeholder="Enter more specific address (optional)">
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        formHtml += `
                    </div>
                    <div class="d-flex justify-content-between mt-3">
                        <button class="btn btn-secondary" onclick="cancelAddressCorrection()">
                            <i class="fas fa-times me-2"></i>Cancel
                        </button>
                        <div>
                            <button class="btn btn-warning me-2" onclick="proceedWithCurrentAddresses()">
                                <i class="fas fa-forward me-2"></i>Proceed with Current Addresses
                            </button>
                            <button class="btn btn-primary" onclick="submitCorrectedAddresses()">
                                <i class="fas fa-check me-2"></i>Validate Corrections
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Replace the entire fileInfo innerHTML (this removes the success alert and proceed button)
        fileInfo.innerHTML = formHtml;
        
        // Store data for later use
        window.validAddresses = validAddresses;
        window.invalidAddresses = invalidAddresses;
    }

    /**
     * Cancel address correction and go back to file upload
     */
    function cancelAddressCorrection() {
        const fileInfo = document.getElementById('fileInfo');
        if (fileInfo) {
            fileInfo.classList.add('hidden');
        }
        
        // Show the file upload area again
        const fileUploadArea = document.getElementById('fileUploadArea');
        if (fileUploadArea) {
            fileUploadArea.style.display = 'block';
        }
        
        // Show the instruction text again
        const instructionText = document.querySelector('#addressUploadCard .card-body > p.text-muted');
        if (instructionText) {
            instructionText.style.display = 'block';
        }
        
        // Reset file input
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.value = '';
        }
        
        // Clear stored data
        window.validAddresses = null;
        window.invalidAddresses = null;
        
        showAlert('Address correction cancelled. Please upload a new file.', 'danger');
    }

    /**
     * Submit corrected addresses for re-validation
     */
    async function submitCorrectedAddresses() {
        try {
            const username = await getCurrentUsername();
            
            if (!username) {
                showAlert('Unable to get username. Please refresh the page.', 'danger');
                return;
            }
            
            const correctedAddresses = [];
            const invalidAddresses = window.invalidAddresses || [];
            
            // Collect corrected addresses (only those that were actually modified)
            invalidAddresses.forEach((address, index) => {
                const correctedInput = document.getElementById(`corrected-${index}`);
                if (correctedInput && correctedInput.value.trim() !== address.address) {
                    correctedAddresses.push({
                        corrected_address: correctedInput.value.trim(),
                        original_data: address
                    });
                }
            });
            
            if (correctedAddresses.length === 0) {
                showAlert('No corrections were made. Use "Proceed with Current Addresses" if you want to continue as-is.', 'info');
                return;
            }
            
            // Start retry geocoding job
            showLoadingIndicator('Starting address correction validation...');
            
            const response = await fetch(`${BACKEND_URL}/retry-geocoding`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    corrected_addresses: correctedAddresses
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                hideLoadingIndicator();
                throw new Error(data.error || 'Address correction failed to start');
            }
            
            if (data.success) {
                // Poll for job status
                await pollRetryGeocodingStatus(data.job_id);
            } else {
                hideLoadingIndicator();
                throw new Error('Address correction failed to start');
            }
            
        } catch (error) {
            hideLoadingIndicator();
            console.error('Address correction error:', error);
            showAlert(`Address correction failed: ${error.message}`, 'danger');
        }
    }

    async function pollRetryGeocodingStatus(jobId, maxWaitMinutes = 5) {
        const startTime = Date.now();
        const maxWaitTime = maxWaitMinutes * 60 * 1000; // Convert to milliseconds
        
        try {
            while (Date.now() - startTime < maxWaitTime) {
                const response = await fetch(`${BACKEND_URL}/validation-status/${jobId}`);
                
                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error('Retry geocoding job not found or expired');
                    }
                    throw new Error('Failed to check retry geocoding status');
                }
                
                const jobInfo = await response.json();
                
                // Update loading indicator with progress
                if (jobInfo.message && jobInfo.progress !== undefined) {
                    showLoadingIndicator(`${jobInfo.message} (${jobInfo.progress}%)`);
                }
                
                if (jobInfo.status === 'completed') {
                    hideLoadingIndicator();
                    
                    if (jobInfo.result && jobInfo.result.success) {
                        const results = jobInfo.result.results;
                        const stillInvalid = results.filter(r => r.status === 'success' && r.confidence !== 'high');
                        const nowValid = results.filter(r => r.status === 'success' && r.confidence === 'high');
                        const failed = results.filter(r => r.status !== 'success');
                        
                        // Keep unchanged addresses from original invalid list
                        const invalidAddresses = window.invalidAddresses || [];
                        const unchangedAddresses = invalidAddresses.filter((address, index) => {
                            const correctedInput = document.getElementById(`corrected-${index}`);
                            return !correctedInput || correctedInput.value.trim() === address.address;
                        });
                        
                        if (stillInvalid.length > 0 || failed.length > 0 || unchangedAddresses.length > 0) {
                            // Some addresses still need attention
                            const allValid = (window.validAddresses || []).concat(nowValid);
                            const allInvalid = [...stillInvalid, ...failed, ...unchangedAddresses];
                            
                            showAlert(`${nowValid.length} addresses improved. ${allInvalid.length} still need attention.`, 'warning');
                            showAddressValidationForm(allValid, allInvalid, 'Updated File');
                        } else {
                            // All addresses are now valid
                            uploadedAddresses = (window.validAddresses || []).concat(nowValid);
                            showAlert(`All addresses validated successfully! Total: ${uploadedAddresses.length}`, 'success');
                            showCleanFileInfo('Corrected File', uploadedAddresses.length);
                            
                            // Clear stored data
                            window.validAddresses = null;
                            window.invalidAddresses = null;
                            
                            await validateDriverAssignments();
                        }
                    } else {
                        throw new Error('Retry geocoding completed but returned no results');
                    }
                    return;
                    
                } else if (jobInfo.status === 'failed') {
                    hideLoadingIndicator();
                    throw new Error(jobInfo.error || 'Retry geocoding failed');
                }
                
                // Wait before next poll (2 seconds)
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // Timeout reached
            hideLoadingIndicator();
            throw new Error(`Retry geocoding timed out after ${maxWaitMinutes} minutes`);
            
        } catch (error) {
            hideLoadingIndicator();
            console.error('Retry geocoding polling error:', error);
            showAlert(`Address correction failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Proceed with current addresses without corrections
     */
    function proceedWithCurrentAddresses() {
        try {
            // Combine valid addresses with invalid ones (as-is)
            const validAddresses = window.validAddresses || [];
            const invalidAddresses = window.invalidAddresses || [];
            
            uploadedAddresses = [...validAddresses, ...invalidAddresses];
            
            const totalCount = uploadedAddresses.length;
            const invalidCount = invalidAddresses.length;
            
            showAlert(`Proceeding with ${totalCount} addresses (${invalidCount} with low confidence)`, 'warning');
            
            // Show clean file info without upload interface
            showCleanFileInfo('Current File', totalCount);
            
            // Clear stored data
            window.validAddresses = null;
            window.invalidAddresses = null;
            
            // Validate driver assignments
            validateDriverAssignments();
            
        } catch (error) {
            console.error('Error proceeding with current addresses:', error);
            showAlert('Error proceeding with addresses. Please try again.', 'danger');
        }
    }

    /**
     * Show clean file info without upload interface
     */
    function showCleanFileInfo(fileName, addressCount) {
        const fileInfo = document.getElementById('fileInfo');
        if (!fileInfo) return;
        
        // Hide the file upload area and instruction text
        const fileUploadArea = document.getElementById('fileUploadArea');
        if (fileUploadArea) {
            fileUploadArea.style.display = 'none';
        }
        
        const instructionText = document.querySelector('#addressUploadCard .card-body > p.text-muted');
        if (instructionText) {
            instructionText.style.display = 'none';
        }
        
        fileInfo.classList.remove('hidden');
        
        // Simple content without the success alert wrapper - just the proceed button
        const cleanHtml = `
            <div class="file-summary mb-3">
                <p class="mb-2">
                    <i class="fas fa-check-circle me-2 text-success"></i>
                    <strong>File:</strong> ${fileName} <br>
                    <strong>Addresses:</strong> ${addressCount} validated
                </p>
            </div>
            <button class="btn btn-primary" onclick="proceedToRouteCreation()">
                <i class="fas fa-arrow-right me-2"></i>Proceed to Route Creation
            </button>
        `;
        
        fileInfo.innerHTML = cleanHtml;
    }

    function showCoverageDetails(coverage) {
        const fileInfo = document.getElementById('fileInfo');
        if (!fileInfo) return;
        
        let coverageHtml = '<div class="mt-3 coverage-details"><h6>Problem Type Coverage:</h6>';
        
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
        
        // Add to file info (replace existing coverage if present)
        const existingCoverage = fileInfo.querySelector('.coverage-details');
        if (existingCoverage) {
            existingCoverage.outerHTML = coverageHtml;
        } else {
            fileInfo.insertAdjacentHTML('beforeend', coverageHtml);
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
        
        let coverageHtml = '<div class="mt-3 coverage-details"><h6>Problem Type Coverage:</h6>';
        
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
        
        // Add to file info (replace existing coverage if present)
        const existingCoverage = fileInfo.querySelector('.coverage-details');
        if (existingCoverage) {
            existingCoverage.outerHTML = coverageHtml;
        } else {
            fileInfo.insertAdjacentHTML('beforeend', coverageHtml);
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

    function showLoadingIndicator(message) {
        // Remove existing loading indicator if present
        hideLoadingIndicator();
        
        const loadingHtml = `
            <div id="global-loading-indicator" class="loading-overlay">
                <div class="loading-content">
                    <div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-3 mb-0 fw-bold">${message}</p>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', loadingHtml);
    }

    function hideLoadingIndicator() {
        const loadingIndicator = document.getElementById('global-loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
    }

    /**
     * Show route creation summary
     */
    function showRouteSummary() {
        const selectedDriversList = document.getElementById('selectedDriversList');
        const addressesSummary = document.getElementById('addressesSummary');
        
        if (selectedDriversList) {
            const driversHtml = selectedDrivers.map(driver => `
                <div class="driver-summary-item card mb-2">
                    <div class="card-body py-2">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <i class="fas fa-user me-2 text-primary"></i>
                                <strong>${driver.member_first_name} ${driver.member_last_name}</strong>
                            </div>
                            <div class="text-end">
                                <small class="text-muted d-block mb-1">
                                    <i class="fas fa-envelope me-1"></i>${driver.member_email}
                                </small>
                                <span class="badge bg-primary">
                                    <i class="fas fa-${driver.starting_location === 'hq' ? 'building' : 'home'} me-1"></i>
                                    ${driver.starting_location?.toUpperCase()}
                                </span>
                            </div>
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
                    <div class="card mb-3">
                        <div class="card-body">
                            <div class="text-center mb-3">
                                <i class="fas fa-map-marker-alt text-success" style="font-size: 2rem;"></i>
                                <h5 class="mt-2 mb-0">${uploadedAddresses.length} Total Addresses</h5>
                            </div>
                            
                            <h6 class="mb-3">
                                <i class="fas fa-chart-pie me-2"></i>Problem Types Distribution:
                            </h6>
                            
                            <div class="problem-types-grid">
            `;
            
            // Create color classes for different problem types
            const colors = ['primary', 'success', 'info', 'warning', 'secondary', 'dark'];
            let colorIndex = 0;
            
            for (const [type, count] of Object.entries(problemTypes)) {
                const percentage = ((count / uploadedAddresses.length) * 100).toFixed(1);
                const color = colors[colorIndex % colors.length];
                colorIndex++;
                
                summaryHtml += `
                    <div class="problem-type-item mb-2">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="d-flex align-items-center">
                                <div class="problem-type-icon me-2">
                                    <i class="fas fa-tools text-${color}"></i>
                                </div>
                                <div>
                                    <strong>${type}</strong>
                                    <small class="text-muted d-block">${percentage}% of total</small>
                                </div>
                            </div>
                            <span class="badge bg-${color} badge-lg">${count}</span>
                        </div>
                        <div class="progress mt-1" style="height: 4px;">
                            <div class="progress-bar bg-${color}" role="progressbar" 
                                style="width: ${percentage}%"></div>
                        </div>
                    </div>
                `;
            }
            
            summaryHtml += `
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
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
        
        // Get and validate date/time inputs
        const routeDateInput = document.getElementById('routeDate');
        const routeTimeInput = document.getElementById('routeTime');
        
        if (!routeDateInput.value || !routeTimeInput.value) {
            showAlert('Please select both a date and time for the route.', 'warning');
            return;
        }
        
        // Validate that the selected date is not in the past
        const selectedDate = new Date(routeDateInput.value + 'T' + routeTimeInput.value);
        const now = new Date();
        
        if (selectedDate <= now) {
            showAlert('Please select a date and time in the future.', 'warning');
            return;
        }
        
        try {
            const username = await getCurrentUsername();
            
            if (!username) {
                showAlert('Unable to get username. Please refresh the page.', 'danger');
                return;
            }
            
            // Show loading indicator
            showLoadingIndicator('Starting route creation...');
            
            // Format drivers for API
            const formattedDrivers = selectedDrivers.map(driver => ({
                email: driver.member_email,
                starting_location: driver.starting_location
            }));
            
            // Start the async job
            const response = await fetch(`${BACKEND_URL}/create-routes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    selected_drivers: formattedDrivers,
                    addresses: uploadedAddresses,
                    route_date: routeDateInput.value,
                    route_time: routeTimeInput.value
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to start route creation');
            }
            
            if (data.success && data.job_id) {
                // Start polling for job status
                pollJobStatus(data.job_id);
            } else {
                throw new Error('Failed to start route creation job');
            }
            
        } catch (error) {
            hideLoadingIndicator();
            console.error('Route creation error:', error);
            showAlert(`Route creation failed: ${error.message}`, 'danger');
        }
    }

    async function pollJobStatus(jobId) {
        const maxPollTime = 60 * 60 * 1000; // 60 minutes max
        const pollInterval = 5000; // 5 seconds
        const startTime = Date.now();
        
        const poll = async () => {
            try {
                const response = await fetch(`${BACKEND_URL}/route-status/${jobId}`, {
                    method: 'GET'
                });
                
                if (!response.ok) {
                    throw new Error('Failed to get job status');
                }
                
                const statusData = await response.json();
                
                // Update loading indicator with progress
                if (statusData.status === 'processing') {
                    const progressText = `${statusData.message} (${statusData.progress || 0}%)`;
                    showLoadingIndicator(progressText);
                    
                    // Check if we've exceeded max poll time
                    if (Date.now() - startTime > maxPollTime) {
                        hideLoadingIndicator();
                        showAlert('Route creation is taking longer than expected. Please check back later.', 'warning');
                        return;
                    }
                    
                    // Continue polling
                    setTimeout(poll, pollInterval);
                    
                } else if (statusData.status === 'completed') {
                    // Job completed successfully
                    hideLoadingIndicator();
                    
                    if (statusData.result && statusData.result.success) {
                        showAlert('Routes created successfully!', 'success');
                        showRouteCreationResults(statusData.result);
                    } else {
                        showAlert('Route creation completed but with errors.', 'warning');
                    }
                    
                } else if (statusData.status === 'failed') {
                    // Job failed
                    hideLoadingIndicator();
                    showAlert(`Route creation failed: ${statusData.error || 'Unknown error'}`, 'danger');
                    
                } else {
                    // Unknown status
                    hideLoadingIndicator();
                    showAlert('Unknown job status. Please try again.', 'warning');
                }
                
            } catch (error) {
                console.error('Error polling job status:', error);
                hideLoadingIndicator();
                showAlert(`Error checking job status: ${error.message}`, 'danger');
            }
        };
        
        // Start polling
        poll();
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
        // Check if styles are already added
        if (document.getElementById('route4me-custom-styles')) {
            return;
        }
        
        const style = document.createElement('style');
        style.id = 'route4me-custom-styles';
        style.textContent = `
            /* Add any additional dynamic styles here if needed */
            .btn-primary.btn-lg {
                padding: 12px 24px;
                font-size: 1.1rem;
                font-weight: 600;
            }
            
            .btn-success.btn-lg {
                padding: 12px 24px;
                font-size: 1.1rem;
                font-weight: 600;
            }
        `;
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
     * Show add driver form
     */
    function showAddDriverForm() {
        // Hide ALL cards and step indicator
        hideCard('userValidationCard');
        hideCard('driverSelectionCard');
        hideCard('addressUploadCard');
        hideCard('routeCreationCard');
        
        // Hide step indicator and main container
        const stepIndicator = document.querySelector('.step-indicator');
        if (stepIndicator) {
            stepIndicator.style.display = 'none';
        }
        
        const mainContainer = document.getElementById('route4meApp');
        if (mainContainer) {
            mainContainer.style.display = 'none';
        }
        
        // Show add driver card
        showCard('addDriverCard');
        
        // Reset form
        document.getElementById('addDriverForm').reset();
        
        // Hide results
        const resultsDiv = document.getElementById('addDriverResults');
        if (resultsDiv) {
            resultsDiv.classList.add('hidden');
            resultsDiv.innerHTML = '';
        }
    }

    /**
     * Cancel add driver operation
     */
    function cancelAddDriver() {
        hideCard('addDriverCard');
        
        // Show step indicator and main container again
        const stepIndicator = document.querySelector('.step-indicator');
        if (stepIndicator) {
            stepIndicator.style.display = 'flex';
        }
        
        const mainContainer = document.getElementById('route4meApp');
        if (mainContainer) {
            mainContainer.style.display = 'block';
        }
        
        // Return to the appropriate card based on current step
        if (currentStep === 1) {
            showCard('userValidationCard');
        } else if (currentStep === 2) {
            showCard('driverSelectionCard');
        } else if (currentStep === 3) {
            showCard('addressUploadCard');
        } else if (currentStep === 4) {
            showCard('routeCreationCard');
        }
    }

    /**
     * Handle add driver form submission
     */
    async function handleAddDriverSubmit() {
        // Prevent form default submission
        event.preventDefault();
        
        // Get form data
        const formData = {
            member_email: document.getElementById('memberEmail').value.trim(),
            member_first_name: document.getElementById('memberFirstName').value.trim(),
            member_last_name: document.getElementById('memberLastName').value.trim(),
            password: document.getElementById('memberPassword').value,
            hq: document.getElementById('driverHq').value.trim(),
            home: document.getElementById('driverHome').value.trim(),
            types: document.getElementById('driverTypes').value.trim()
        };
        
        // Validate required fields
        if (!formData.member_email || !formData.member_first_name || !formData.member_last_name || 
            !formData.password || !formData.hq || !formData.home || !formData.types) {
            showAlert('Please fill in all required fields', 'danger');
            return;
        }
        
        // Process types (convert comma-separated string to array)
        const typesArray = formData.types.split(',').map(type => type.trim().toUpperCase()).filter(type => type);
        
        try {
            // Get current username
            const username = await getCurrentUsername();
            
            // Show loading state
            showLoadingInCard('addDriverCard', 'Adding driver...');
            
            // Submit to backend
            const response = await fetch(`${BACKEND_URL}/add-driver`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    driver_data: {
                        member_email: formData.member_email,
                        member_first_name: formData.member_first_name,
                        member_last_name: formData.member_last_name,
                        password: formData.password,
                        hq: formData.hq,
                        home: formData.home,
                        types: typesArray
                    }
                })
            });
            
            const data = await response.json();
            
            // Clear loading state
            hideLoadingInCard('addDriverCard');
            
            if (response.ok && data.success) {
                showAddDriverResults(data);
                showAlert('Driver added successfully!', 'success');
            } else {
                showAddDriverError(data.error || 'Failed to add driver');
                showAlert(data.error || 'Failed to add driver', 'danger');
            }
            
        } catch (error) {
            console.error('Error adding driver:', error);
            
            // Clear loading state
            hideLoadingInCard('addDriverCard');
            
            showAddDriverError('Network error occurred while adding driver');
            showAlert('Network error occurred while adding driver', 'danger');
        }
    }

    /**
     * Show add driver success results
     */
    function showAddDriverResults(data) {
        const resultsDiv = document.getElementById('addDriverResults');
        if (!resultsDiv) return;
        
        resultsDiv.innerHTML = `
            <div class="alert alert-success">
                <h6><i class="fas fa-check-circle me-2"></i>Driver Added Successfully!</h6>
                <p class="mb-2"><strong>Route4Me Member ID:</strong> ${data.route4me_member_id}</p>
                <p class="mb-2"><strong>Email:</strong> ${data.driver_email}</p>
                <p class="mb-0"><strong>Configuration:</strong> Driver information saved to local database</p>
            </div>
            <div class="text-center">
                <button class="btn btn-primary" onclick="cancelAddDriver()">
                    <i class="fas fa-arrow-left me-2"></i>Back to App
                </button>
            </div>
        `;
        
        resultsDiv.classList.remove('hidden');
    }

    /**
     * Show add driver error
     */
    function showAddDriverError(errorMessage) {
        const resultsDiv = document.getElementById('addDriverResults');
        if (!resultsDiv) return;
        
        resultsDiv.innerHTML = `
            <div class="alert alert-danger">
                <h6><i class="fas fa-exclamation-triangle me-2"></i>Error Adding Driver</h6>
                <p class="mb-0">${errorMessage}</p>
            </div>
            <div class="text-center">
                <button class="btn btn-secondary" onclick="showAddDriverForm()">
                    <i class="fas fa-redo me-2"></i>Try Again
                </button>
            </div>
        `;
        
        resultsDiv.classList.remove('hidden');
    }

    /**
     * Helper function to hide loading state in card and restore original content
     */
    function hideLoadingInCard(cardId) {
        const card = document.getElementById(cardId);
        if (!card) return;
        
        // For addDriverCard, restore the form and results area
        if (cardId === 'addDriverCard') {
            const content = card.querySelector('.card-body');
            if (content) {
                content.innerHTML = `
                    <form id="addDriverForm">
                        <div class="row">
                            <div class="col-md-6">
                                <h6><i class="fas fa-route me-2"></i>Route4Me Information</h6>
                                <div class="mb-3">
                                    <label for="memberEmail" class="form-label">Email Address</label>
                                    <input type="email" class="form-control" id="memberEmail" required>
                                </div>
                                <div class="mb-3">
                                    <label for="memberFirstName" class="form-label">First Name</label>
                                    <input type="text" class="form-control" id="memberFirstName" required>
                                </div>
                                <div class="mb-3">
                                    <label for="memberLastName" class="form-label">Last Name</label>
                                    <input type="text" class="form-control" id="memberLastName" required>
                                </div>
                                <div class="mb-3">
                                    <label for="memberPassword" class="form-label">Password</label>
                                    <input type="password" class="form-control" id="memberPassword" required>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <h6><i class="fas fa-cog me-2"></i>Driver Configuration</h6>
                                <div class="mb-3">
                                    <label for="driverHq" class="form-label">HQ Address</label>
                                    <input type="text" class="form-control" id="driverHq" required>
                                </div>
                                <div class="mb-3">
                                    <label for="driverHome" class="form-label">Home Address</label>
                                    <input type="text" class="form-control" id="driverHome" required>
                                </div>
                                <div class="mb-3">
                                    <label for="driverTypes" class="form-label">Service Types (comma-separated)</label>
                                    <textarea class="form-control" id="driverTypes" rows="5" 
                                            placeholder="Enter service types separated by commas (e.g., BOUNDARY SURVEY, HOUSE STAKE, FINAL SURVEY)"></textarea>
                                    <small class="form-text text-muted">Enter the types of services this driver can handle</small>
                                </div>
                            </div>
                        </div>
                        <div class="text-center">
                            <button type="button" class="btn btn-secondary me-2" onclick="cancelAddDriver()">
                                <i class="fas fa-times me-2"></i>Cancel
                            </button>
                            <button type="submit" class="btn btn-success" onclick="handleAddDriverSubmit()">
                                <i class="fas fa-plus me-2"></i>Add Driver
                            </button>
                        </div>
                    </form>
                    <div class="mt-3 hidden" id="addDriverResults">
                        <!-- Results will be shown here -->
                    </div>
                `;
            }
        } else {
            // For other cards, try to remove loading overlay if it exists
            const loadingOverlay = card.querySelector('.loading-overlay');
            if (loadingOverlay) {
                loadingOverlay.remove();
            }
            
            // Re-enable form elements if they exist
            const form = card.querySelector('form');
            if (form) {
                const inputs = form.querySelectorAll('input, textarea, button');
                inputs.forEach(input => {
                    input.disabled = false;
                });
            }
        }
    }


    /**
     * Expose global functions
     */
    window.initializeApp = initializeApp;
    window.updateDriverSelection = updateDriverSelection;
    window.proceedToAddressUpload = proceedToAddressUpload;
    window.proceedToRouteCreation = proceedToRouteCreation;
    window.createRoutes = createRoutes;
    window.submitCorrectedAddresses = submitCorrectedAddresses;
    window.cancelAddressCorrection = cancelAddressCorrection;
    window.proceedWithCurrentAddresses = proceedWithCurrentAddresses;
    window.filterDrivers = filterDrivers;
    window.showAddDriverForm = showAddDriverForm;
    window.cancelAddDriver = cancelAddDriver;
    window.handleAddDriverSubmit = handleAddDriverSubmit;
    window.selectAllDrivers = selectAllDrivers;
    window.deselectAllDrivers = deselectAllDrivers;

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
            
            // Clean up any existing modal backdrops from previous focus cycles
            const existingBackdrops = document.querySelectorAll('.modal-backdrop');
            existingBackdrops.forEach(backdrop => backdrop.remove());
            
            // Ensure body classes are clean
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
            
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