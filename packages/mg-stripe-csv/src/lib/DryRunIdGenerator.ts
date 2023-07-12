class DryRunIdGenerator {
    counter = 0;

    getNext(prefix = 'fake_') {
        this.counter += 1;
        return prefix + this.counter;
    }
}

export default new DryRunIdGenerator();
