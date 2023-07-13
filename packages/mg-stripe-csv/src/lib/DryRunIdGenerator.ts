class DryRunIdGenerator {
    counter = 0;

    getNext(prefix = 'fake_') {
        this.counter += 1;
        return prefix + this.counter;
    }

    getUnique(prefix = 'fake_') {
        return prefix + Date.now() + '_' + this.getNext();
    }
}

export default new DryRunIdGenerator();
