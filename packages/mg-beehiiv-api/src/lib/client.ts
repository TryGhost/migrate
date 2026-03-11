const client = async (apiKey: string) => {
    const url = new URL(`https://api.beehiiv.com/v2/publications`);

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${apiKey}`
        }
    });

    if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return data.data;
};

export {
    client
};
