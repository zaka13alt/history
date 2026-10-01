    <script>
        window.addEventListener('beforeunload', function (event) {
            event.preventDefault();
            event.returnValue = '';
            return 'Are you sure you want to leave? Any unsaved changes will be lost.';
        });
    </script>
