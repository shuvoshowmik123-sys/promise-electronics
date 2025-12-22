import { NativeBiometric } from "@capgo/capacitor-native-biometric";

export const useBiometrics = () => {
    const server = "promise-electronics.app"; // Unique ID for your Keystore entry

    const saveAuth = async (username, password) => {
        try {
            await NativeBiometric.setCredentials({
                username,
                password,
                server,
            });
            return true;
        } catch (error) {
            console.error("Failed to save biometric credentials", error);
            return false;
        }
    };

    const deleteAuth = async () => {
        try {
            await NativeBiometric.deleteCredentials({ server });
            return true;
        } catch (error) {
            console.error("Failed to delete biometric credentials", error);
            return false;
        }
    };

    const getAuth = async () => {
        try {
            // 1. Check if hardware is available
            const result = await NativeBiometric.isAvailable();
            if (!result.isAvailable) return null;

            // 2. Trigger the native Fingerprint/Face ID prompt
            await NativeBiometric.verifyIdentity({
                reason: "Log in to Promise Electronics",
                title: "Biometric Login",
                subtitle: "Use your fingerprint or face to continue",
                negativeButtonText: "Cancel",
            });

            // 3. If verified, retrieve the encrypted credentials
            const credentials = await NativeBiometric.getCredentials({ server });
            return credentials; // { username, password }
        } catch (error) {
            console.error("Biometric failed", error);
            return null;
        }
    };

    const checkAvailability = async () => {
        try {
            const result = await NativeBiometric.isAvailable();
            return result.isAvailable;
        } catch (error) {
            return false;
        }
    };

    return { saveAuth, getAuth, deleteAuth, checkAvailability };
};
