const removeEmptyUsers = (data) => {
    // Assign temp IDs to users without IDs
    data.users.forEach((user) => {
        if (!user.id || user.id === '') {
            user.id = `temp-id-${Math.random().toString(36).substring(2, 15)}`;
        }
    });

    // Remove users without posts and their role associations
    const userIdsWithPosts = new Set(
        data.posts_authors.map(pa => pa.author_id)
    );

    data.users = data?.users?.filter(user => userIdsWithPosts.has(user.id)) || [];
    data.roles_users = data?.roles_users?.filter(ru => userIdsWithPosts.has(ru.user_id)) || [];

    return data;
};

export {
    removeEmptyUsers
};
