function checkNodeVersion() {
    const requiredVersion = 17;
    const currentNodeVersion = parseInt(process.version.slice(1), 10);
    if (currentNodeVersion < requiredVersion) {
        console.error(`Error: Your Node.js version (${currentNodeVersion}) is not supported by this package. Please upgrade to Node.js version ${requiredVersion} or higher.`);
        process.exit(1);
    }
}

try {
    checkNodeVersion();
} catch (error) {
    console.error('Error occurred while checking Node.js version:', error);
    process.exit(1);
}
