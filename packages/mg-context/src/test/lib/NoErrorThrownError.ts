export default class NoErrorThrownError extends Error {}

const getError = async (call: any) => {
    try {
        await call();

        throw new NoErrorThrownError();
    } catch (error) {
        return error;
    }
};

export {
    NoErrorThrownError,
    getError
};
