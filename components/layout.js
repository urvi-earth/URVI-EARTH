async function loadComponent(id, file) {

    const response = await fetch(file);

    document.getElementById(id).innerHTML = await response.text();

}

loadComponent("vineDecoration","../components/vineDecoration.html");

