/**
 * Route4Me Integration Add-in
 * @returns {{initialize: Function, focus: Function, blur: Function}}
 */

const isGeotabEnvironment = typeof geotab !== 'undefined';

let api;
let state;
let elAddin;
let currentUser = null;
let subDrivers = [];
let selectedDrivers = [];
let uploadedAddresses = [];
let currentStep = 1;
let currentJobTypes = [];
let currentMap = null;
let currentMarker = null;
let currentAddressIndex = null;

// Backend URL - Update this to your EC2 instance URL
const BACKEND_URL = 'https://traxxisgps.duckdns.org/api';

/**
 * Get current Geotab username using session, or prompt for email if outside Geotab
 */
function getCurrentUsername() { 
    return new Promise((resolve, reject) => { 
        if (isGeotabEnvironment && api && api.getSession) { 
            // Inside Geotab - try to get session
            api.getSession(function(session) { 
                console.log('session:', session); 
                if (session && session.userName) { 
                    resolve(session.userName); 
                } else { 
                    // Session exists but no username - prompt for email
                    promptForEmailValidation().then(resolve).catch(reject); 
                } 
            }); 
        } else { 
            // Outside Geotab - prompt for email
            promptForEmailValidation().then(resolve).catch(reject); 
        } 
    }); 
}

/**
 * Prompt user to enter their email for validation
 */
function promptForEmailValidation() {
    console.log('Prompting for email validation...WOOT!');
    return new Promise((resolve, reject) => {
        showEmailPrompt(resolve, reject);
    });
}

/**
 * Show email input form (updated to store resolve/reject globally for resend)
 */
function showEmailPrompt(resolve, reject) {
    console.log('Showing email prompt...BEDO BEDO BEDO!');
    
    const content = document.getElementById('userValidationContent');
    if (!content) {
        reject(new Error('Validation content element not found'));
        return;
    }
    
    // Store resolve/reject globally
    window.currentEmailResolve = resolve;
    window.currentEmailReject = reject;
    
    // Don't create nested div.text-center - the parent already has this class
    content.innerHTML = `
        <i class="fas fa-envelope text-primary" style="font-size: 3rem;"></i>
        <h5 class="mt-3">Email Verification Required</h5>
        <p class="text-muted">Please enter your Route4Me email address to continue</p>
        <form id="emailForm" class="mt-4">
            <div class="mb-3">
                <input type="email" class="form-control" id="emailInput" 
                    placeholder="Enter your email address" required>
            </div>
            <button type="submit" class="btn btn-primary">
                <i class="fas fa-paper-plane me-2"></i>Send Verification Code
            </button>
        </form>
    `;
    
    const emailForm = document.getElementById('emailForm');
    emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('emailInput').value.trim();
        
        if (!email) {
            showAlert('Please enter a valid email address', 'danger');
            return;
        }
        
        try {
            await sendVerificationCode(email, resolve, reject);
        } catch (error) {
            showAlert(`Error: ${error.message}`, 'danger');
            reject(error);
        }
    });
}

/**
 * Send verification code to email
 */
async function sendVerificationCode(email, resolve, reject) {
    try {
        // Show loading state in the content area instead of replacing the entire card
        const content = document.getElementById('userValidationContent');
        if (!content) {
            reject(new Error('Validation content element not found'));
            return;
        }
        
        content.innerHTML = `
            <div class="text-center">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-3 text-muted">Checking email and sending verification code...</p>
            </div>
        `;

        console.log('Sending verification code to:', email);
        
        const response = await fetch(`${BACKEND_URL}/send-verification-code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email
            })
        });

        console.log('Send verification code response:', response);
        
        const data = await response.json();

        console.log('Send verification code data:', data);
        
        if (!response.ok) {
            if (response.status === 404) {
                showEmailNotFoundError(email);
                reject(new Error('Email not found in Route4Me system'));
                return;
            }
            throw new Error(data.error || 'Failed to send verification code');
        }
        
        if (data.success) {
            // Don't resolve here - wait for code verification
            console.log('Verification code sent successfully');
            showVerificationCodePrompt(email, resolve, reject);
        } else {
            throw new Error('Failed to send verification code');
        }
        
    } catch (error) {
        console.error('Send verification code error:', error);
        showAlert(`Failed to send verification code: ${error.message}`, 'danger');
        reject(error);
    }
}

/**
 * Show email not found error
 */
function showEmailNotFoundError(email) {
    const content = document.getElementById('userValidationContent');
    if (!content) return;
    
    content.innerHTML = `
        <div class="text-center">
            <i class="fas fa-exclamation-triangle text-warning" style="font-size: 3rem;"></i>
            <h5 class="mt-3">Email Not Found</h5>
            <p class="text-muted">
                The email address <strong>${email}</strong> is not associated with a Route4Me account in our system.
            </p>
            <p class="text-muted">
                Please check your email address or contact your administrator to add your Route4Me API key.
            </p>
            <button class="btn btn-primary mt-2" onclick="promptForEmailValidation().then(() => {}).catch(() => {})">
                <i class="fas fa-arrow-left me-2"></i>Try Different Email
            </button>
        </div>
    `;
}

/**
 * Show verification code input form
 */
function showVerificationCodePrompt(email, resolve, reject) {
    const content = document.getElementById('userValidationContent');
    if (!content) {
        reject(new Error('Validation content element not found'));
        return;
    }
    
    content.innerHTML = `
        <div class="text-center">
            <i class="fas fa-shield-alt text-success" style="font-size: 3rem;"></i>
            <h5 class="mt-3">Verification Code Sent</h5>
            <p class="text-muted">
                We've sent a verification code to<br>
                <strong>${email}</strong>
            </p>
            <form id="verificationForm" class="mt-4">
                <div class="mb-3">
                    <input type="text" class="form-control text-center" id="verificationCodeInput" 
                        placeholder="Enter 6-digit code" maxlength="6" required
                        style="font-size: 1.5rem; letter-spacing: 0.5rem;">
                </div>
                <button type="submit" class="btn btn-success">
                    <i class="fas fa-check me-2"></i>Verify Code
                </button>
                <button type="button" class="btn btn-link" onclick="resendVerificationCode('${email}')">
                    <i class="fas fa-redo me-2"></i>Resend Code
                </button>
            </form>
        </div>
    `;
    
    const verificationForm = document.getElementById('verificationForm');
    const codeInput = document.getElementById('verificationCodeInput');
    
    // Auto-submit when 6 digits are entered
    codeInput.addEventListener('input', (e) => {
        const value = e.target.value.replace(/\D/g, ''); // Only allow digits
        e.target.value = value;
        
        if (value.length === 6) {
            verificationForm.dispatchEvent(new Event('submit'));
        }
    });
    
    verificationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = codeInput.value.trim();
        
        if (code.length !== 6) {
            showAlert('Please enter a 6-digit verification code', 'danger');
            return;
        }
        
        try {
            await verifyCode(email, code, resolve, reject);
        } catch (error) {
            showAlert(`Verification failed: ${error.message}`, 'danger');
        }
    });
}

/**
 * Resend verification code (helper function for the resend button)
 */
async function resendVerificationCode(email) {
    try {
        showLoadingInCard('userValidationCard', 'Resending verification code...');
        
        const response = await fetch(`${BACKEND_URL}/send-verification-code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to resend verification code');
        }
        
        if (data.success) {
            // Re-show the verification form
            const currentResolve = window.currentEmailResolve;
            const currentReject = window.currentEmailReject;
            showVerificationCodePrompt(email, currentResolve, currentReject);
            showAlert('Verification code resent successfully', 'success');
        } else {
            throw new Error('Failed to resend verification code');
        }
        
    } catch (error) {
        console.error('Resend verification code error:', error);
        showAlert(`Failed to resend verification code: ${error.message}`, 'danger');
    }
}

/**
 * Verify the entered code
 */
async function verifyCode(email, code, resolve, reject) {
    try {
        showLoadingInCard('userValidationCard', 'Verifying code...');
        
        const response = await fetch(`${BACKEND_URL}/verify-code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                code: code
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (response.status === 400) {
                showVerificationCodeError('Invalid or expired verification code');
                return;
            }
            throw new Error(data.error || 'Verification failed');
        }
        
        if (data.success) {
            // Now resolve with the email after successful verification
            resolve(email);
        } else {
            throw new Error('Code verification failed');
        }
        
    } catch (error) {
        console.error('Code verification error:', error);
        showVerificationCodeError(error.message);
        // Don't reject here to allow user to try again
    }
}

/**
 * Show verification code error
 */
function showVerificationCodeError(errorMessage) {
    showAlert(errorMessage, 'danger');
    // Re-focus the input for user to try again
    const codeInput = document.getElementById('verificationCodeInput');
    if (codeInput) {
        codeInput.value = '';
        codeInput.focus();
    }
}

/**
 * Initialize the application
 */
function initializeApp() {
    console.log('Initializing Route4Me app...:)');
    resetApplication();

    if (isGeotabEnvironment) {
        validateUser();
    }
    else {
        console.log('Not in Geotab environment, starting email validation...');
        startEmailValidation();
    }
}

/**
 * Start the email validation process
 */
async function startEmailValidation() {
    try {

        console.log('Starting email validation process...');
        
        // Start the email validation flow
        const email = await promptForEmailValidation();
        
        console.log('Email entered for validation:', email);

        // After successful email verification, validate the user
        await validateUserWithEmail(email);
        
    } catch (error) {
        console.error('Email validation process failed:', error);
        showAlert(`Email validation failed: ${error.message}`, 'danger');
    }
}

/**
 * Validate user credentials with Route4Me using verified email
 */
async function validateUserWithEmail(email) {
    console.log('Validating user credentials with email:', email);
    
    try {
        showLoadingInCard('userValidationCard', 'Validating user credentials...');
        
        const response = await fetch(`${BACKEND_URL}/validate-user`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: email // Use the verified email as username
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
 * Validate user credentials with Route4Me (modified to handle email verification)
 */
async function validateUser() {
    console.log('Validating user credentials...');
    
    try {
        const username = await getCurrentUsername();
        
        if (!username) {
            showAlert('Unable to get user credentials. Please refresh the page.', 'danger');
            return;
        }

        console.log('Current username/email:', username);
        
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
                    <div class="col-md-4">
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
                    <div class="col-md-4">
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
                    <div class="col-md-4 text-end">
                        <button class="btn btn-outline-secondary btn-sm" onclick="showEditDriverForm('${driver.member_email}')">
                            <i class="fas fa-edit me-1"></i>Edit!!!
                        </button>
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

        let username;

        if (isGeotabEnvironment) {
            username = await getCurrentUsername();
        }
        else {
            username = currentUser.member_email;
        }
        
        
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
 * Show address validation form for invalid addresses (MODIFIED)
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
    
    // Filter out manually adjusted addresses and create mapping
    const manualCoordinates = window.manualCoordinates || {};
    const filteredInvalidAddresses = [];
    const manuallyAdjustedAddresses = [];
    const originalToFilteredIndexMap = {};
    
    invalidAddresses.forEach((address, originalIndex) => {
        const hasManualCoords = manualCoordinates[originalIndex] && manualCoordinates[originalIndex].manually_adjusted;
        
        if (hasManualCoords) {
            // Add to manually adjusted (move to valid)
            manuallyAdjustedAddresses.push({
                ...address,
                lat: manualCoordinates[originalIndex].lat,
                lng: manualCoordinates[originalIndex].lng,
                confidence: 'manually_adjusted',
                manually_adjusted: true
            });
        } else {
            // Keep in invalid list and track the index mapping
            originalToFilteredIndexMap[originalIndex] = filteredInvalidAddresses.length;
            filteredInvalidAddresses.push({
                ...address,
                originalIndex: originalIndex // Store original index for reference
            });
        }
    });
    
    const allValidAddresses = [...validAddresses, ...manuallyAdjustedAddresses];
    
    const validCount = allValidAddresses.length;
    const invalidCount = filteredInvalidAddresses.length;
    
    // If no invalid addresses remain, proceed directly
    if (filteredInvalidAddresses.length === 0) {
        uploadedAddresses = allValidAddresses;
        showAlert(`All addresses validated successfully! Total: ${uploadedAddresses.length}`, 'success');
        showCleanFileInfo(fileName, uploadedAddresses.length);
        
        // Clear stored data
        window.validAddresses = null;
        window.invalidAddresses = null;
        window.manualCoordinates = {};
        
        validateDriverAssignments();
        return;
    }
    
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
                    <strong>Route4Me is not fully confident in the location of these addresses, would you like to make any corrections?</strong>
                </p>
            </div>
            
            <div class="invalid-addresses-form">
                <h6>Please review the following addresses:</h6>
                <div class="invalid-addresses-list">
    `;
    
    filteredInvalidAddresses.forEach((address, filteredIndex) => {
        const originalIndex = address.originalIndex;
        formHtml += `
            <div class="invalid-address-item card mb-3">
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-5">
                            <h6 class="card-title">${address.builder_name} - ${address.problem_type}</h6>
                            <p class="text-muted mb-2">
                                <strong>Address:</strong> ${address.address}<br>
                                <strong>Confidence:</strong> ${address.confidence || 'Low confidence'}
                                ${address.lat && address.lng ? `<br><strong>Coordinates:</strong> ${address.lat.toFixed(6)}, ${address.lng.toFixed(6)}` : ''}
                            </p>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Corrected Address (Optional):</label>
                            <input type="text" class="form-control corrected-address" 
                                id="corrected-${filteredIndex}" 
                                data-original-index="${originalIndex}"
                                value="${address.address}"
                                placeholder="Enter corrected address (optional)">
                        </div>
                        <div class="col-md-3 text-center">
                            ${address.lat && address.lng ? `
                                <button class="btn btn-info btn-sm mb-2" onclick="showLocationMap(${originalIndex}, ${address.lat}, ${address.lng}, '${address.address.replace(/'/g, "\\'")}')">
                                    <i class="fas fa-map-marker-alt me-1"></i>View on Map
                                </button>
                                <div class="small text-muted" id="coords-display-${originalIndex}">
                                    ${address.lat.toFixed(6)}, ${address.lng.toFixed(6)}
                                </div>
                            ` : `
                                <div class="text-muted small">
                                    <i class="fas fa-exclamation-triangle"></i><br>
                                    No coordinates available
                                </div>
                            `}
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
    
    // Store data for later use (update with filtered data)
    window.validAddresses = allValidAddresses;
    window.invalidAddresses = filteredInvalidAddresses;
    window.originalToFilteredIndexMap = originalToFilteredIndexMap;
    // Keep existing manualCoordinates
}


/**
 * Show location on map for manual adjustment
 */
function showLocationMap(addressIndex, lat, lng, address) {
    currentAddressIndex = addressIndex;
    
    // Hide ALL cards and step indicator (same pattern as edit driver)
    hideCard('userValidationCard');
    hideCard('driverSelectionCard');
    hideCard('addressUploadCard');
    hideCard('routeCreationCard');
    hideCard('addDriverCard');
    hideCard('jobTypesCard');
    
    // Hide step indicator and main container
    const stepIndicator = document.querySelector('.step-indicator');
    if (stepIndicator) {
        stepIndicator.style.display = 'none';
    }
    
    const mainContainer = document.getElementById('route4meApp');
    if (mainContainer) {
        mainContainer.style.display = 'none';
    }
    
    // Show the location adjustment card
    showLocationAdjustmentCard(addressIndex, lat, lng, address);
}

/**
 * Show location adjustment card (replaces modal)
 */
function showLocationAdjustmentCard(addressIndex, lat, lng, address) {
    // Create or get the location adjustment card
    let locationCard = document.getElementById('locationAdjustmentCard');
    
    if (!locationCard) {
        // Create the card if it doesn't exist and insert it after the main container
        locationCard = document.createElement('div');
        locationCard.id = 'locationAdjustmentCard';
        locationCard.className = 'card hidden';
        
        // Insert after the main container div
        const mainContainer = document.getElementById('route4meApp');
        mainContainer.parentNode.insertBefore(locationCard, mainContainer.nextSibling);
    }
    
    locationCard.innerHTML = `
        <div class="card-header">
            <h5>
                <i class="fas fa-map-marker-alt me-2"></i>Adjust Location
            </h5>
        </div>
        <div class="card-body">
            <div class="mb-3">
                <strong>Address:</strong> <span id="adjustmentAddress">${address}</span>
            </div>
            <div class="mb-3">
                <div class="row">
                    <div class="col-md-6">
                        <label class="form-label">Latitude:</label>
                        <input type="number" class="form-control" id="adjustmentLat" step="0.000001" value="${lat}" readonly>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Longitude:</label>
                        <input type="number" class="form-control" id="adjustmentLng" step="0.000001" value="${lng}" readonly>
                    </div>
                </div>
                <small class="form-text text-muted">Drag the marker on the map to adjust the location</small>
            </div>
            <div id="adjustmentMap" style="height: 400px; width: 100%; border: 1px solid #dee2e6; border-radius: 0.375rem;"></div>
            
            <div class="text-center mt-3">
                <button type="button" class="btn btn-secondary me-2" onclick="cancelLocationAdjustment()">
                    <i class="fas fa-times me-2"></i>Cancel
                </button>
                <button type="button" class="btn btn-primary" onclick="saveLocationChanges()">
                    <i class="fas fa-check me-2"></i>Save Location
                </button>
            </div>
        </div>
    `;
    
    // Show the card (remove hidden class)
    locationCard.classList.remove('hidden');
    
    // Initialize map after card is shown
    setTimeout(() => {
        initializeLocationMap(lat, lng);
    }, 100);
}

/**
 * Initialize the Leaflet map (modified to use new container)
 */
function initializeLocationMap(lat, lng) {
    // Clear existing map if any
    if (currentMap) {
        currentMap.remove();
        currentMap = null;
    }
    
    // Initialize map with new container ID
    currentMap = L.map('adjustmentMap').setView([lat, lng], 15);
    
    // Add tile layer (using OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(currentMap);
    
    // Add draggable marker
    currentMarker = L.marker([lat, lng], {
        draggable: true
    }).addTo(currentMap);
    
    // Update coordinates when marker is dragged
    currentMarker.on('dragend', function(e) {
        const position = e.target.getLatLng();
        document.getElementById('adjustmentLat').value = position.lat.toFixed(6);
        document.getElementById('adjustmentLng').value = position.lng.toFixed(6);
    });
    
    // Allow clicking on map to move marker
    currentMap.on('click', function(e) {
        const { lat, lng } = e.latlng;
        currentMarker.setLatLng([lat, lng]);
        document.getElementById('adjustmentLat').value = lat.toFixed(6);
        document.getElementById('adjustmentLng').value = lng.toFixed(6);
    });
}

/**
 * Save the manually adjusted location (modified to work with card instead of modal)
 */
function saveLocationChanges() {
    if (currentAddressIndex === null) return;
    
    const newLat = parseFloat(document.getElementById('adjustmentLat').value);
    const newLng = parseFloat(document.getElementById('adjustmentLng').value);
    
    // Store the manual coordinates
    if (!window.manualCoordinates) {
        window.manualCoordinates = {};
    }
    window.manualCoordinates[currentAddressIndex] = {
        lat: newLat,
        lng: newLng,
        manually_adjusted: true
    };
    
    // Update the coordinates display in the form
    const coordsDisplay = document.getElementById(`coords-display-${currentAddressIndex}`);
    if (coordsDisplay) {
        coordsDisplay.innerHTML = `${newLat.toFixed(6)}, ${newLng.toFixed(6)}<br><small class="text-success"><i class="fas fa-check"></i> Manually adjusted</small>`;
    }
    
    // Update the invalid address data
    if (window.invalidAddresses && window.invalidAddresses[currentAddressIndex]) {
        window.invalidAddresses[currentAddressIndex].lat = newLat;
        window.invalidAddresses[currentAddressIndex].lng = newLng;
        window.invalidAddresses[currentAddressIndex].manually_adjusted = true;
    }
    
    // Hide location adjustment card and return to address upload
    cancelLocationAdjustment();
    
    // Show success message
    showAlert(`Location updated for address at index ${currentAddressIndex + 1}`, 'success');
    
    // Reset current values
    currentAddressIndex = null;
}

/**
 * Cancel location adjustment and return to address upload (modified function)
 */
function cancelLocationAdjustment() {
    // Clean up map
    if (currentMap) {
        currentMap.remove();
        currentMap = null;
    }
    
    // Hide location adjustment card
    const locationCard = document.getElementById('locationAdjustmentCard');
    if (locationCard) {
        locationCard.classList.add('hidden');
    }
    
    // Show step indicator and main container
    const stepIndicator = document.querySelector('.step-indicator');
    if (stepIndicator) {
        stepIndicator.style.display = 'flex';
    }
    
    const mainContainer = document.getElementById('route4meApp');
    if (mainContainer) {
        mainContainer.style.display = 'block';
    }
    
    // Show the address upload card
    showCard('addressUploadCard');
    
    // Reset current address index
    currentAddressIndex = null;
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
 * Submit corrected addresses for re-validation (MODIFIED)
 */
async function submitCorrectedAddresses() {
    try {
        let username;

        if (isGeotabEnvironment) {
            username = await getCurrentUsername();
        }
        else {
            username = currentUser.member_email;
        }
        
        if (!username) {
            showAlert('Unable to get username. Please refresh the page.', 'danger');
            return;
        }
        
        const correctedAddresses = [];
        const invalidAddresses = window.invalidAddresses || [];
        const manualCoordinates = window.manualCoordinates || {};
        
        // Collect corrected addresses and manual coordinates
        invalidAddresses.forEach((address, filteredIndex) => {
            const originalIndex = address.originalIndex;
            const correctedInput = document.getElementById(`corrected-${filteredIndex}`);
            const hasManualCoords = manualCoordinates[originalIndex];
            const hasAddressChange = correctedInput && correctedInput.value.trim() !== address.address;
            
            // Include if there are manual coordinates OR address changes
            if (hasManualCoords || hasAddressChange) {
                const correctionData = {
                    original_data: {
                        ...address,
                        originalIndex: originalIndex // Include original index for backend reference
                    }
                };
                
                // If there are manual coordinates, use them
                if (hasManualCoords) {
                    correctionData.manual_coordinates = {
                        lat: hasManualCoords.lat,
                        lng: hasManualCoords.lng,
                        manually_adjusted: true
                    };
                }
                
                // If there's an address change, include it
                if (hasAddressChange) {
                    correctionData.corrected_address = correctedInput.value.trim();
                }
                
                correctedAddresses.push(correctionData);
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

/**
 * Poll retry geocoding status (MODIFIED)
 */
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
                    const stillInvalid = results.filter(r => 
                        r.status === 'success' && 
                        r.confidence !== 'high' && 
                        r.confidence !== 'manually_adjusted'
                    );
                    const nowValid = results.filter(r => 
                        r.status === 'success' && 
                        (r.confidence === 'high' || r.confidence === 'manually_adjusted')
                    );
                    const failed = results.filter(r => r.status !== 'success');
                    
                    // Keep unchanged addresses from original invalid list (excluding manually adjusted ones)
                    const invalidAddresses = window.invalidAddresses || [];
                    const manualCoordinates = window.manualCoordinates || {};
                    const unchangedAddresses = invalidAddresses.filter((address, filteredIndex) => {
                        const originalIndex = address.originalIndex;
                        const correctedInput = document.getElementById(`corrected-${filteredIndex}`);
                        const hasManualCoords = manualCoordinates[originalIndex];
                        const hasAddressChange = correctedInput && correctedInput.value.trim() !== address.address;
                        
                        // Keep if no changes were made AND not manually adjusted
                        return !hasAddressChange && !hasManualCoords;
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
                        window.manualCoordinates = {};
                        
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
 * Save the manually adjusted location (MODIFIED to work with original indices)
 */
function saveLocationChanges() {
    if (currentAddressIndex === null) return;
    
    const newLat = parseFloat(document.getElementById('adjustmentLat').value);
    const newLng = parseFloat(document.getElementById('adjustmentLng').value);
    
    // Store the manual coordinates using original index
    if (!window.manualCoordinates) {
        window.manualCoordinates = {};
    }
    window.manualCoordinates[currentAddressIndex] = {
        lat: newLat,
        lng: newLng,
        manually_adjusted: true
    };
    
    // Update the coordinates display in the form (if it exists)
    const coordsDisplay = document.getElementById(`coords-display-${currentAddressIndex}`);
    if (coordsDisplay) {
        coordsDisplay.innerHTML = `${newLat.toFixed(6)}, ${newLng.toFixed(6)}<br><small class="text-success"><i class="fas fa-check"></i> Manually adjusted</small>`;
    }
    
    // Update the invalid address data if it exists in the current filtered list
    if (window.invalidAddresses) {
        const addressInFilteredList = window.invalidAddresses.find(addr => addr.originalIndex === currentAddressIndex);
        if (addressInFilteredList) {
            addressInFilteredList.lat = newLat;
            addressInFilteredList.lng = newLng;
            addressInFilteredList.manually_adjusted = true;
        }
    }
    
    // Hide location adjustment card and return to address upload
    cancelLocationAdjustment();
    
    // Show success message
    showAlert(`Location updated for address. It will be moved to valid addresses.`, 'success');
    
    // Refresh the validation form to remove this address from invalid list
    if (window.validAddresses && window.invalidAddresses) {
        showAddressValidationForm(window.validAddresses, window.invalidAddresses, 'Updated File');
    }
    
    // Reset current values
    currentAddressIndex = null;
}

/**
 * Proceed with current addresses without corrections (MODIFIED)
 */
function proceedWithCurrentAddresses() {
    try {
        // Combine valid addresses with invalid ones (as-is)
        const validAddresses = window.validAddresses || [];
        const invalidAddresses = window.invalidAddresses || [];
        const manualCoordinates = window.manualCoordinates || {};
        
        // Apply manual coordinates to invalid addresses before combining
        const updatedInvalidAddresses = invalidAddresses.map((address, filteredIndex) => {
            const originalIndex = address.originalIndex;
            if (manualCoordinates[originalIndex]) {
                return {
                    ...address,
                    lat: manualCoordinates[originalIndex].lat,
                    lng: manualCoordinates[originalIndex].lng,
                    confidence: 'manually_adjusted',
                    manually_adjusted: true
                };
            }
            return address;
        });
        
        uploadedAddresses = [...validAddresses, ...updatedInvalidAddresses];
        
        const totalCount = uploadedAddresses.length;
        const manuallyAdjustedCount = Object.keys(manualCoordinates).length;
        const lowConfidenceCount = updatedInvalidAddresses.filter(addr => 
            !addr.manually_adjusted && addr.confidence !== 'high'
        ).length;
        
        let message = `Proceeding with ${totalCount} addresses`;
        if (manuallyAdjustedCount > 0) {
            message += ` (${manuallyAdjustedCount} manually adjusted`;
            if (lowConfidenceCount > 0) {
                message += `, ${lowConfidenceCount} with low confidence)`;
            } else {
                message += ')';
            }
        } else if (lowConfidenceCount > 0) {
            message += ` (${lowConfidenceCount} with low confidence)`;
        }
        
        showAlert(message, 'warning');
        
        // Show clean file info without upload interface
        showCleanFileInfo('Current File', totalCount);
        
        // Clear stored data
        window.validAddresses = null;
        window.invalidAddresses = null;
        window.manualCoordinates = {};
        
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

        let username;

        if (isGeotabEnvironment) {
            username = await getCurrentUsername();
        }
        else {
            username = currentUser.member_email;
        }
        
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
 * Show add driver form (modified to load job types)
 */
function showAddDriverForm() {
    if (!currentUser && !isGeotabEnvironment) {
        showAlert('Please verify your email to add a driver.', 'warning');
        return;
    }

    // Hide ALL cards and step indicator
    hideCard('userValidationCard');
    hideCard('driverSelectionCard');
    hideCard('addressUploadCard');
    hideCard('routeCreationCard');
    hideCard('jobTypesCard');
    
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
    
    // Load job types for selection
    loadJobTypesForDriverForm();
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
 * Handle add driver form submission (modified to use selected job types)
 */
async function handleAddDriverSubmit() {
    // Prevent form default submission
    event.preventDefault();
    
    // Get selected job types
    const selectedJobTypes = getSelectedJobTypes();
    
    // Get form data
    const formData = {
        member_email: document.getElementById('memberEmail').value.trim(),
        member_first_name: document.getElementById('memberFirstName').value.trim(),
        member_last_name: document.getElementById('memberLastName').value.trim(),
        password: document.getElementById('memberPassword').value,
        hq: document.getElementById('driverHq').value.trim(),
        home: document.getElementById('driverHome').value.trim(),
        types: selectedJobTypes
    };
    
    // Validate required fields
    if (!formData.member_email || !formData.member_first_name || !formData.member_last_name || 
        !formData.password || !formData.hq || !formData.home) {
        showAlert('Please fill in all required fields', 'danger');
        return;
    }
    
    // Validate job types selection
    if (selectedJobTypes.length === 0) {
        showAlert('Please select at least one service type', 'danger');
        return;
    }
    
    try {
        console.log('Adding driver with data:', formData);
        console.log('Current user:', currentUser);
        // Get current username
        let username;

        if (isGeotabEnvironment) {
            username = await getCurrentUsername();
        }
        else {
            username = currentUser.member_email;
        }
        
        // Show loading state
        showLoadingInCard('addDriverCard', 'Adding driver...');

        console.log('Submitting driver data to backend:')

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
                    types: formData.types // This is now an array from getSelectedJobTypes()
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
 * Show job types management form
 */
function showJobTypesForm() {
    if (!currentUser && !isGeotabEnvironment) {
        showAlert('Please verify your email to manage job types.', 'warning');
        return;
    }

    // Hide ALL cards and step indicator
    hideCard('userValidationCard');
    hideCard('driverSelectionCard');
    hideCard('addressUploadCard');
    hideCard('routeCreationCard');
    hideCard('addDriverCard');
    
    // Hide step indicator and main container
    const stepIndicator = document.querySelector('.step-indicator');
    if (stepIndicator) {
        stepIndicator.style.display = 'none';
    }
    
    const mainContainer = document.getElementById('route4meApp');
    if (mainContainer) {
        mainContainer.style.display = 'none';
    }
    
    // Show job types card
    showCard('jobTypesCard');
    
    // Reset form
    document.getElementById('addJobTypeForm').reset();
    
    // Hide results
    const resultsDiv = document.getElementById('jobTypesResults');
    if (resultsDiv) {
        resultsDiv.classList.add('hidden');
        resultsDiv.innerHTML = '';
    }
    
    // Load job types
    loadJobTypes();
}

/**
 * Cancel job types management
 */
function cancelJobTypes() {
    hideCard('jobTypesCard');
    
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
 * Load job types for the current user
 */
async function loadJobTypes() {
    try {
        let username;
        if (isGeotabEnvironment) {
            username = await getCurrentUsername();
        } else {
            username = currentUser.member_email;
        }

        const response = await fetch(`${BACKEND_URL}/get-job-types`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            currentJobTypes = data.job_types || [];
            renderJobTypesList();
        } else {
            throw new Error(data.error || 'Failed to load job types');
        }
    } catch (error) {
        console.error('Error loading job types:', error);
        const jobTypesList = document.getElementById('jobTypesList');
        if (jobTypesList) {
            jobTypesList.innerHTML = `
                <div class="text-center text-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p class="mt-2">Error loading job types</p>
                </div>
            `;
        }
    }
}

/**
 * Render the job types list
 */
function renderJobTypesList() {
    const jobTypesList = document.getElementById('jobTypesList');
    if (!jobTypesList) return;

    if (currentJobTypes.length === 0) {
        jobTypesList.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-info-circle"></i>
                <p class="mt-2">No job types added yet</p>
            </div>
        `;
        return;
    }

    const jobTypesHtml = currentJobTypes.map(jobType => `
        <div class="job-type-item d-flex justify-content-between align-items-center mb-2 p-3 border rounded">
            <div>
                <span class="fw-bold"><i class="fas fa-tag me-2"></i>${jobType.name}</span>
                <br>
                <small class="text-muted"><i class="fas fa-clock me-1"></i>${jobType.duration} minutes</small>
            </div>
            <button class="btn btn-danger btn-sm" onclick="deleteJobType('${jobType.name}')" title="Delete job type">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');

    jobTypesList.innerHTML = jobTypesHtml;
}

/**
 * Handle add job type form submission
 */
async function handleAddJobType(event) {
    event.preventDefault();
    
    const jobTypeName = document.getElementById('newJobType').value.trim().toUpperCase();
    const jobDuration = document.getElementById('newJobDuration').value.trim();
    
    if (!jobTypeName) {
        showAlert('Please enter a job type name', 'danger');
        return;
    }
    
    if (!jobDuration || isNaN(jobDuration) || parseInt(jobDuration) <= 0) {
        showAlert('Please enter a valid duration in minutes', 'danger');
        return;
    }
    
    // Check if job type already exists
    const existingJob = currentJobTypes.find(job => job.name === jobTypeName);
    if (existingJob) {
        showAlert('This job type already exists', 'warning');
        return;
    }
    
    try {
        let username;
        if (isGeotabEnvironment) {
            username = await getCurrentUsername();
        } else {
            username = currentUser.member_email;
        }

        const response = await fetch(`${BACKEND_URL}/add-job-type`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                job_type: jobTypeName,
                duration: parseInt(jobDuration)
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            currentJobTypes = data.job_types;
            renderJobTypesList();
            document.getElementById('newJobType').value = '';
            document.getElementById('newJobDuration').value = '';
            showJobTypesResults(`Job type "${jobTypeName}" with ${jobDuration} minute duration added successfully!`, 'success');
        } else {
            throw new Error(data.error || 'Failed to add job type');
        }
    } catch (error) {
        console.error('Error adding job type:', error);
        showJobTypesResults(error.message, 'danger');
    }
}

/**
 * Delete a job type
 */
async function deleteJobType(jobTypeName) {
    
    try {
        let username;
        if (isGeotabEnvironment) {
            username = await getCurrentUsername();
        } else {
            username = currentUser.member_email;
        }

        const response = await fetch(`${BACKEND_URL}/delete-job-type`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                job_type: jobTypeName
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            currentJobTypes = data.job_types;
            renderJobTypesList();
            showJobTypesResults(`Job type "${jobTypeName}" deleted successfully!`, 'success');
        } else {
            throw new Error(data.error || 'Failed to delete job type');
        }
    } catch (error) {
        console.error('Error deleting job type:', error);
        showJobTypesResults(error.message, 'danger');
    }
}

/**
 * Show job types operation results
 */
function showJobTypesResults(message, type) {
    const resultsDiv = document.getElementById('jobTypesResults');
    if (!resultsDiv) return;
    
    const alertClass = type === 'success' ? 'alert-success' : 'alert-danger';
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle';
    
    resultsDiv.innerHTML = `
        <div class="alert ${alertClass}">
            <i class="fas ${icon} me-2"></i>${message}
        </div>
    `;
    
    resultsDiv.classList.remove('hidden');
    
    // Hide after 3 seconds
    setTimeout(() => {
        resultsDiv.classList.add('hidden');
    }, 3000);
}

/**
 * Load job types for driver selection (modified version for add driver form)
 */
async function loadJobTypesForDriverForm() {
    try {
        let username;
        if (isGeotabEnvironment) {
            username = await getCurrentUsername();
        } else {
            username = currentUser.member_email;
        }

        const response = await fetch(`${BACKEND_URL}/get-job-types`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            renderJobTypesSelection(data.job_types || []);
        } else {
            throw new Error(data.error || 'Failed to load job types');
        }
    } catch (error) {
        console.error('Error loading job types for driver form:', error);
        const jobTypesSelection = document.getElementById('jobTypesSelection');
        if (jobTypesSelection) {
            jobTypesSelection.innerHTML = `
                <div class="text-center text-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p class="mt-2">Error loading job types. Please add some job types first.</p>
                </div>
            `;
        }
    }
}

/**
 * Render job types selection checkboxes for driver form
 */
function renderJobTypesSelection(jobTypes) {
    const jobTypesSelection = document.getElementById('jobTypesSelection');
    if (!jobTypesSelection) return;

    if (jobTypes.length === 0) {
        jobTypesSelection.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-info-circle"></i>
                <p class="mt-2">No job types available. Please add some job types first.</p>
            </div>
        `;
        return;
    }

    const checkboxesHtml = jobTypes.map(jobType => `
        <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" value="${jobType.name}" id="jobType-${jobType.name}">
            <label class="form-check-label" for="jobType-${jobType.name}">
                <i class="fas fa-tag me-2"></i>${jobType.name}
                <small class="text-muted ms-2">(<i class="fas fa-clock me-1"></i>${jobType.duration} min)</small>
            </label>
        </div>
    `).join('');

    jobTypesSelection.innerHTML = `
        <div class="mb-2">
            <button type="button" class="btn btn-outline-primary btn-sm me-2" onclick="selectAllJobTypes()">
                <i class="fas fa-check-square me-1"></i>Select All
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm" onclick="deselectAllJobTypes()">
                <i class="fas fa-square me-1"></i>Deselect All
            </button>
        </div>
        ${checkboxesHtml}
    `;
}

/**
 * Select all job types in driver form
 */
function selectAllJobTypes() {
    const checkboxes = document.querySelectorAll('#jobTypesSelection input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
}

/**
 * Deselect all job types in driver form
 */
function deselectAllJobTypes() {
    const checkboxes = document.querySelectorAll('#jobTypesSelection input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
}

/**
 * Get selected job types from driver form
 */
function getSelectedJobTypes() {
    const checkboxes = document.querySelectorAll('#jobTypesSelection input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(checkbox => checkbox.value);
}

/**
 * Helper function to hide loading state in card and restore original content (modified for new job types UI)
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
                                <label for="driverTypes" class="form-label">Service Types</label>
                                <div id="jobTypesSelection" class="border rounded p-3" style="max-height: 200px; overflow-y: auto;">
                                    <div class="text-center text-muted">
                                        <i class="fas fa-spinner fa-spin"></i> Loading job types...
                                    </div>
                                </div>
                                <small class="form-text text-muted">Select the types of services this driver can handle</small>
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
            
            // Reload job types after restoring the form
            loadJobTypesForDriverForm();
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
 * Show edit driver form (NEW FUNCTION)
 */
async function showEditDriverForm(driverEmail) {
    try {
        // Find the driver in subDrivers
        const driver = subDrivers.find(d => d.member_email === driverEmail);
        if (!driver) {
            showAlert('Driver not found', 'danger');
            return;
        }

        // Get current username to fetch driver configuration
        let username;
        if (isGeotabEnvironment) {
            username = await getCurrentUsername();
        } else {
            username = currentUser.member_email;
        }

        // Fetch driver configuration from backend
        const response = await fetch(`${BACKEND_URL}/get-driver-config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                driver_email: driverEmail
            })
        });

        const configData = await response.json();
        
        // Hide ALL cards and step indicator
        hideCard('userValidationCard');
        hideCard('driverSelectionCard');
        hideCard('addressUploadCard');
        hideCard('routeCreationCard');
        hideCard('jobTypesCard');
        
        // Hide step indicator and main container
        const stepIndicator = document.querySelector('.step-indicator');
        if (stepIndicator) {
            stepIndicator.style.display = 'none';
        }
        
        const mainContainer = document.getElementById('route4meApp');
        if (mainContainer) {
            mainContainer.style.display = 'none';
        }
        
        // Show add driver card (we'll reuse it for editing)
        showCard('addDriverCard');
        
        // Update card header for editing
        const cardHeader = document.querySelector('#addDriverCard .card-header h5');
        if (cardHeader) {
            cardHeader.innerHTML = '<i class="fas fa-user-edit me-2"></i>Edit Driver';
        }
        
        // Pre-fill form with driver data
        document.getElementById('memberEmail').value = driver.member_email;
        document.getElementById('memberEmail').disabled = true; // Don't allow email changes
        document.getElementById('memberFirstName').value = driver.member_first_name;
        document.getElementById('memberLastName').value = driver.member_last_name;
        document.getElementById('memberPassword').value = ''; // Don't pre-fill password for security
        
        if (response.ok && configData.success) {
            document.getElementById('driverHq').value = configData.config.hq || '';
            document.getElementById('driverHome').value = configData.config.home || '';
            
            // Load job types and pre-select the driver's types
            await loadJobTypesForDriverForm();
            if (configData.config.types) {
                setSelectedJobTypes(configData.config.types);
            }
        } else {
            // If no config found, still load job types but don't pre-select any
            await loadJobTypesForDriverForm();
            showAlert('Driver configuration not found. Please set HQ, Home, and Job Types.', 'warning');
        }
        
        // Hide results
        const resultsDiv = document.getElementById('addDriverResults');
        if (resultsDiv) {
            resultsDiv.classList.add('hidden');
            resultsDiv.innerHTML = '';
        }
        
        // Update the submit button to handle editing
        const submitButton = document.querySelector('#addDriverCard button[onclick="handleAddDriverSubmit()"]');
        if (submitButton) {
            submitButton.innerHTML = '<i class="fas fa-save me-2"></i>Update Driver';
            submitButton.setAttribute('onclick', `handleEditDriverSubmit('${driverEmail}')`);
        }
        
    } catch (error) {
        console.error('Error loading driver for editing:', error);
        showAlert('Error loading driver information', 'danger');
    }
}

/**
 * Handle edit driver form submission (NEW FUNCTION)
 */
async function handleEditDriverSubmit(originalEmail) {
    // Prevent form default submission
    event.preventDefault();
    
    // Get selected job types
    const selectedJobTypes = getSelectedJobTypes();
    
    // Get form data
    const formData = {
        member_email: document.getElementById('memberEmail').value.trim(),
        member_first_name: document.getElementById('memberFirstName').value.trim(),
        member_last_name: document.getElementById('memberLastName').value.trim(),
        password: document.getElementById('memberPassword').value,
        hq: document.getElementById('driverHq').value.trim(),
        home: document.getElementById('driverHome').value.trim(),
        types: selectedJobTypes
    };
    
    // Validate required fields (password is optional for editing)
    if (!formData.member_email || !formData.member_first_name || !formData.member_last_name || 
        !formData.hq || !formData.home) {
        showAlert('Please fill in all required fields', 'danger');
        return;
    }
    
    // Validate job types selection
    if (selectedJobTypes.length === 0) {
        showAlert('Please select at least one service type', 'danger');
        return;
    }
    
    try {
        console.log('Updating driver with data:', formData);
        
        // Get current username
        let username;
        if (isGeotabEnvironment) {
            username = await getCurrentUsername();
        } else {
            username = currentUser.member_email;
        }
        
        // Show loading state
        showLoadingInCard('addDriverCard', 'Updating driver...');

        // Submit to backend
        const response = await fetch(`${BACKEND_URL}/edit-driver`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                original_email: originalEmail,
                driver_data: {
                    member_email: formData.member_email,
                    member_first_name: formData.member_first_name,
                    member_last_name: formData.member_last_name,
                    password: formData.password || undefined, // Only include if provided
                    hq: formData.hq,
                    home: formData.home,
                    types: formData.types
                }
            })
        });
        
        const data = await response.json();
        
        // Clear loading state
        hideLoadingInCard('addDriverCard');
        
        if (response.ok && data.success) {
            showEditDriverResults(data);
            showAlert('Driver updated successfully!', 'success');
            
            // Update the local subDrivers array
            const driverIndex = subDrivers.findIndex(d => d.member_email === originalEmail);
            if (driverIndex !== -1) {
                subDrivers[driverIndex].member_first_name = formData.member_first_name;
                subDrivers[driverIndex].member_last_name = formData.member_last_name;
                subDrivers[driverIndex].member_email = formData.member_email;
            }
        } else {
            showEditDriverError(data.error || 'Failed to update driver');
            showAlert(data.error || 'Failed to update driver', 'danger');
        }
        
    } catch (error) {
        console.error('Error updating driver:', error);
        
        // Clear loading state
        hideLoadingInCard('addDriverCard');
        
        showEditDriverError('Network error occurred while updating driver');
        showAlert('Network error occurred while updating driver', 'danger');
    }
}

/**
 * Show edit driver success results (MODIFIED FUNCTION)
 */
function showEditDriverResults(data) {
    // Instead of showing results, automatically go back to driver selection
    cancelEditDriver();
    
    // Re-render the driver list to reflect the updated information
    validateUser();
}

/**
 * Show edit driver error (NEW FUNCTION)
 */
function showEditDriverError(errorMessage) {
    const resultsDiv = document.getElementById('addDriverResults');
    if (!resultsDiv) return;
    
    resultsDiv.innerHTML = `
        <div class="alert alert-danger">
            <h6><i class="fas fa-exclamation-triangle me-2"></i>Error Updating Driver</h6>
            <p class="mb-0">${errorMessage}</p>
        </div>
        <div class="text-center">
            <button class="btn btn-secondary" onclick="location.reload()">
                <i class="fas fa-redo me-2"></i>Refresh Page
            </button>
        </div>
    `;
    
    resultsDiv.classList.remove('hidden');
}

/**
 * Cancel edit driver operation (NEW FUNCTION)
 */
function cancelEditDriver() {
    // Reset form elements that were modified for editing
    document.getElementById('memberEmail').disabled = false;
    
    // Reset card header
    const cardHeader = document.querySelector('#addDriverCard .card-header h5');
    if (cardHeader) {
        cardHeader.innerHTML = '<i class="fas fa-user-plus me-2"></i>Add New Driver';
    }
    
    // Reset submit button
    const submitButton = document.querySelector('#addDriverCard button[onclick*="handleEditDriverSubmit"]');
    if (submitButton) {
        submitButton.innerHTML = '<i class="fas fa-plus me-2"></i>Add Driver';
        submitButton.setAttribute('onclick', 'handleAddDriverSubmit()');
    }
    
    // Use the existing cancelAddDriver function to handle the rest
    cancelAddDriver();
}

/**
 * Set selected job types (NEW FUNCTION - helper for pre-selecting job types)
 */
function setSelectedJobTypes(jobTypesArray) {
    const checkboxes = document.querySelectorAll('#jobTypesSelection input[type="checkbox"]');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = jobTypesArray.includes(checkbox.value);
    });
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
window.resendVerificationCode = resendVerificationCode;
window.showJobTypesForm = showJobTypesForm;
window.cancelJobTypes = cancelJobTypes;
window.loadJobTypesForDriverForm = loadJobTypesForDriverForm;
window.loadJobTypes = loadJobTypes;
window.handleAddJobType = handleAddJobType;
window.deleteJobType = deleteJobType;
window.showJobTypesResults = showJobTypesResults;
window.selectAllJobTypes = selectAllJobTypes;
window.deselectAllJobTypes = deselectAllJobTypes;
window.getSelectedJobTypes = getSelectedJobTypes;
window.showEditDriverForm = showEditDriverForm;
window.handleEditDriverSubmit = handleEditDriverSubmit;
window.showEditDriverResults = showEditDriverResults;
window.showEditDriverError = showEditDriverError;
window.cancelEditDriver = cancelEditDriver;
window.setSelectedJobTypes = setSelectedJobTypes;
window.saveLocationChanges = saveLocationChanges;
window.initializeLocationMap = initializeLocationMap;
window.showLocationMap = showLocationMap;

if (isGeotabEnvironment) {
    geotab.addin.route4me = function () { 
        'use strict';

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
    }
}
else {
    // Running standalone - initialize immediately when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded');
        
        // Check if element exists immediately after DOM load
        const validationContent = document.getElementById('userValidationContent');
        console.log('userValidationContent found on load:', validationContent);
        
        // Set up a mutation observer to watch for changes
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList') {
                    console.log('DOM mutation detected:', mutation);
                    const stillExists = document.getElementById('userValidationContent');
                    console.log('userValidationContent still exists:', stillExists);
                }
            });
        });
        
        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        elAddin = document.getElementById('route4meApp');
        
        if (elAddin) { 
            elAddin.style.display = 'block'; 
        }
        
        // Check again before calling initialize
        setTimeout(() => {
            const stillThere = document.getElementById('userValidationContent');
            console.log('userValidationContent before initialize:', stillThere);
            initializeAppWithStyles(); 
        }, 100);
    });
}